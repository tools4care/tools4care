package com.tools4care.payments

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.stripe.stripeterminal.Terminal
import com.stripe.stripeterminal.external.callable.Callback
import com.stripe.stripeterminal.external.callable.ConnectionTokenCallback
import com.stripe.stripeterminal.external.callable.ConnectionTokenProvider
import com.stripe.stripeterminal.external.callable.DiscoveryListener
import com.stripe.stripeterminal.external.callable.PaymentIntentCallback
import com.stripe.stripeterminal.external.callable.ReaderCallback
import com.stripe.stripeterminal.external.callable.SetupIntentCallback
import com.stripe.stripeterminal.external.callable.TapToPayReaderListener
import com.stripe.stripeterminal.external.callable.TerminalListener
import com.stripe.stripeterminal.external.models.AllowRedisplay
import com.stripe.stripeterminal.external.models.CollectPaymentIntentConfiguration
import com.stripe.stripeterminal.external.models.CollectSetupIntentConfiguration
import com.stripe.stripeterminal.external.models.ConnectionConfiguration
import com.stripe.stripeterminal.external.models.ConnectionStatus
import com.stripe.stripeterminal.external.models.ConnectionTokenException
import com.stripe.stripeterminal.external.models.DeviceType
import com.stripe.stripeterminal.external.models.DiscoveryConfiguration
import com.stripe.stripeterminal.external.models.DisconnectReason
import com.stripe.stripeterminal.external.models.PaymentIntent
import com.stripe.stripeterminal.external.models.PaymentStatus
import com.stripe.stripeterminal.external.models.Reader
import com.stripe.stripeterminal.external.models.SetupIntent
import com.stripe.stripeterminal.external.models.TapUseCase
import com.stripe.stripeterminal.external.models.TerminalException
import com.stripe.stripeterminal.log.LogLevel
import java.util.concurrent.Executors

class TerminalPaymentController(
    private val context: Context,
    private val api: CompanionApi,
    private val bootstrap: PaymentBootstrap,
    private val onStatus: (String) -> Unit,
    private val onComplete: (Boolean, String) -> Unit,
) {
    private val io = Executors.newSingleThreadExecutor()
    private var discoveryCancelable: com.stripe.stripeterminal.external.callable.Cancelable? = null

    private val terminalListener = object : TerminalListener {
        override fun onConnectionStatusChange(status: ConnectionStatus) {
            onStatus("Reader: ${status.name.lowercase().replace('_', ' ')}")
        }
        override fun onPaymentStatusChange(status: PaymentStatus) {
            onStatus("Payment: ${status.name.lowercase().replace('_', ' ')}")
        }
    }

    private val readerListener = object : TapToPayReaderListener {
        override fun onDisconnect(reason: DisconnectReason) {
            onStatus("Tap to Pay disconnected: ${reason.name.lowercase().replace('_', ' ')}")
        }
    }

    fun start() {
        try {
            initializeTerminal()
            when (Terminal.getInstance().connectionStatus) {
                ConnectionStatus.CONNECTED -> {
                    onStatus("Secure Tap to Pay reader already connected. Resuming payment…")
                    retrieveIntent()
                    return
                }
                ConnectionStatus.CONNECTING -> {
                    onStatus("Finishing the secure reader connection…")
                    Handler(Looper.getMainLooper()).postDelayed({ start() }, 900)
                    return
                }
                else -> Unit
            }
            val simulated = BuildConfig.DEBUG
            discoverReader(simulated, allowRecovery = true)
        } catch (error: Throwable) {
            onComplete(false, error.message ?: "Could not initialize Stripe Terminal.")
        }
    }

    private fun discoverReader(simulated: Boolean, allowRecovery: Boolean) {
        try {
            val discovery = DiscoveryConfiguration.TapToPayDiscoveryConfiguration(isSimulated = simulated)
            val support = Terminal.getInstance().supportsReadersOfType(DeviceType.TAP_TO_PAY_DEVICE, discovery)
            if (!support.isSupported) {
                onComplete(false, support.error?.message ?: "This Android device does not support Stripe Tap to Pay.")
                return
            }
            onStatus(if (simulated) "Starting simulated Tap to Pay…" else "Preparing Tap to Pay…")
            var connecting = false
            discoveryCancelable = Terminal.getInstance().discoverReaders(
                discovery,
                object : DiscoveryListener {
                    override fun onUpdateDiscoveredReaders(readers: List<Reader>) {
                        if (connecting || readers.isEmpty()) return
                        connecting = true
                        discoveryCancelable?.cancel(object : Callback {
                            override fun onSuccess() = connect(readers.first())
                            override fun onFailure(e: TerminalException) = connect(readers.first())
                        })
                    }
                },
                object : Callback {
                    override fun onSuccess() = Unit
                    override fun onFailure(e: TerminalException) {
                        val needsDisconnect = e.errorMessage.contains("disconnect", ignoreCase = true)
                        if (allowRecovery && needsDisconnect) {
                            onStatus("Resetting the previous reader connection…")
                            Terminal.getInstance().disconnectReader(object : Callback {
                                override fun onSuccess() = discoverReader(simulated, allowRecovery = false)
                                override fun onFailure(disconnectError: TerminalException) =
                                    onComplete(false, disconnectError.errorMessage)
                            })
                        } else onComplete(false, e.errorMessage)
                    }
                },
            )
        } catch (error: Throwable) {
            onComplete(false, error.message ?: "Could not initialize Stripe Terminal.")
        }
    }

    private fun initializeTerminal() {
        if (Terminal.isInitialized()) return
        Terminal.init(
            context.applicationContext,
            if (BuildConfig.DEBUG) LogLevel.VERBOSE else LogLevel.INFO,
            object : ConnectionTokenProvider {
                override fun fetchConnectionToken(callback: ConnectionTokenCallback) {
                    io.execute {
                        runCatching { api.connectionToken() }
                            .onSuccess(callback::onSuccess)
                            .onFailure { callback.onFailure(ConnectionTokenException(it.message ?: "Connection token failed", it)) }
                    }
                }
            },
            terminalListener,
            null,
        )
    }

    private fun connect(reader: Reader) {
        onStatus("Connecting secure Tap to Pay reader…")
        val configuration = ConnectionConfiguration.TapToPayConnectionConfiguration(
            useCase = TapUseCase.Pay(bootstrap.stripeLocationId),
            autoReconnectOnUnexpectedDisconnect = true,
            tapToPayReaderListener = readerListener,
            merchantDisplayName = "Tools4Care",
        )
        Terminal.getInstance().connectReader(reader, configuration, object : ReaderCallback {
            override fun onSuccess(reader: Reader) = retrieveIntent()
            override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
        })
    }

    private fun retrieveIntent() {
        if (bootstrap.intentType == "setup") return retrieveSetupIntent()
        onStatus("Loading payment…")
        Terminal.getInstance().retrievePaymentIntent(bootstrap.clientSecret, object : PaymentIntentCallback {
            override fun onSuccess(paymentIntent: PaymentIntent) = collectAndConfirm(paymentIntent)
            override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
        })
    }

    private fun retrieveSetupIntent() {
        onStatus("Preparing secure card storage…")
        Terminal.getInstance().retrieveSetupIntent(bootstrap.clientSecret, object : SetupIntentCallback {
            override fun onSuccess(setupIntent: SetupIntent) {
                onStatus("Ask the customer to tap the card they want to save.")
                Terminal.getInstance().processSetupIntent(setupIntent, AllowRedisplay.ALWAYS, CollectSetupIntentConfiguration.Builder().build(), object : SetupIntentCallback {
                    override fun onSuccess(setupIntent: SetupIntent) = syncResult()
                    override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
                })
            }
            override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
        })
    }

    private fun collectAndConfirm(paymentIntent: PaymentIntent) {
        onStatus("Ask the customer to tap their card.")
        val collectConfig = CollectPaymentIntentConfiguration.Builder()
            .skipTipping(true)
            .setAllowRedisplay(if (bootstrap.saveRequested) AllowRedisplay.ALWAYS else AllowRedisplay.UNSPECIFIED)
            .build()
        Terminal.getInstance().collectPaymentMethod(paymentIntent, object : PaymentIntentCallback {
            override fun onSuccess(collected: PaymentIntent) {
                onStatus("Confirming payment…")
                Terminal.getInstance().confirmPaymentIntent(collected, object : PaymentIntentCallback {
                    override fun onSuccess(confirmed: PaymentIntent) = syncResult()
                    override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
                })
            }
            override fun onFailure(e: TerminalException) = onComplete(false, e.errorMessage)
        }, collectConfig)
    }

    private fun syncResult() {
        onStatus("Payment approved. Updating Tools4Care…")
        io.execute {
            runCatching { api.syncResult() }
                .onSuccess { result ->
                    val resultStatus = result.optString("status", "")
                    if (bootstrap.intentType != "setup" && resultStatus != "reconciled") {
                        onComplete(false, "Payment approved, but Tools4Care reconciliation is pending. Keep this screen open and retry synchronization.")
                        return@onSuccess
                    }
                    val saved = result.optBoolean("card_saved", false)
                    val unavailable = result.optBoolean("reusable_card_unavailable", false)
                    val message = when {
                        saved -> "Payment approved and card saved."
                        unavailable -> "Payment approved. Stripe could not create a reusable card from this tap."
                        else -> "Payment approved."
                    }
                    onComplete(true, message)
                }
                .onFailure { onComplete(false, "Payment was approved, but Tools4Care reconciliation is pending: ${it.message}") }
        }
    }
}
