package com.tools4care.payments

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.Manifest
import android.content.pm.PackageManager
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import com.tools4care.payments.databinding.ActivityMainBinding
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.NumberFormat
import java.util.Currency

class MainActivity : AppCompatActivity() {
    private lateinit var binding: ActivityMainBinding
    private var companionToken: String? = null
    private var bootstrap: PaymentBootstrap? = null
    private var controller: TerminalPaymentController? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)
        binding.title.text = "Secure card payment"
        binding.versionInfo.text = "Tools4Care Pay · v${BuildConfig.VERSION_NAME}"
        binding.cancelButton.setOnClickListener { cancelAndFinish() }
        binding.payButton.setOnClickListener { beginTapToPay() }
        handleIntent(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent) {
        val token = intent.data?.getQueryParameter("token")
        if (token.isNullOrBlank()) {
            binding.status.text = "Open a card payment from Tools4Care to begin."
            binding.payButton.isEnabled = false
            return
        }
        companionToken = token
        binding.status.text = "Loading the protected payment session…"
        lifecycleScope.launch {
            runCatching { withContext(Dispatchers.IO) { CompanionApi(token).bootstrap() } }
                .onSuccess { data ->
                    bootstrap = data
                    binding.customer.text = data.customerName
                    binding.amount.text = NumberFormat.getCurrencyInstance().apply {
                        currency = Currency.getInstance("USD")
                    }.format(data.amountCents / 100.0)
                    binding.consentSection.visibility = if (data.saveOffered) android.view.View.VISIBLE else android.view.View.GONE
                    binding.consent.visibility = if (data.saveOffered) android.view.View.VISIBLE else android.view.View.GONE
                    binding.consent.isChecked = false
                    binding.status.text = if (data.intentType == "setup") "Customer authorization is required before saving this card." else "Ready for Tap to Pay."
                    binding.payButton.isEnabled = true
                }
                .onFailure { error ->
                    binding.status.text = error.message ?: "Could not load payment session."
                    binding.payButton.isEnabled = false
                }
        }
    }

    private fun beginTapToPay() {
        val permissions = buildList {
            add(Manifest.permission.ACCESS_FINE_LOCATION)
            if (android.os.Build.VERSION.SDK_INT >= 31) {
                add(Manifest.permission.BLUETOOTH_SCAN)
                add(Manifest.permission.BLUETOOTH_CONNECT)
            }
        }.filter { ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED }
        if (permissions.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, permissions.toTypedArray(), 7001)
            return
        }
        startTerminalCollection()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != 7001) return
        if (grantResults.isNotEmpty() && grantResults.all { it == PackageManager.PERMISSION_GRANTED }) startTerminalCollection()
        else binding.status.text = "Location and nearby-device permissions are required for Tap to Pay."
    }

    private fun startTerminalCollection() {
        val token = companionToken ?: return
        val originalData = bootstrap ?: return
        binding.payButton.isEnabled = false
        lifecycleScope.launch {
          val api = CompanionApi(token)
          val accepted = binding.consent.visibility == android.view.View.VISIBLE && binding.consent.isChecked
          if (originalData.intentType == "setup" && !accepted) {
              binding.status.text = "The customer must check the authorization box to save this card."
              binding.payButton.isEnabled = true
              return@launch
          }
          val configured = runCatching { withContext(Dispatchers.IO) { api.setSavePreference(accepted) } }
          if (configured.isFailure) {
              binding.status.text = configured.exceptionOrNull()?.message ?: "Could not record the customer's choice."
              binding.payButton.isEnabled = true
              return@launch
          }
          val data = originalData.copy(saveRequested = configured.getOrDefault(false))
          controller = TerminalPaymentController(
            context = this@MainActivity,
            api = api,
            bootstrap = data,
            onStatus = { message -> runOnUiThread { binding.status.text = message } },
            onComplete = { success, message ->
                runOnUiThread {
                    binding.status.text = message
                    if (success) {
                        binding.payButton.text = "Payment complete"
                        binding.payButton.isEnabled = false
                        binding.cancelButton.isEnabled = false
                        binding.cancelButton.visibility = android.view.View.GONE
                        // The companion was opened by Tools4Care through a custom
                        // URI. Remove its task after briefly showing approval;
                        // Android then reveals the exact Tools4Care screen that
                        // launched it, where the approved amount is recovered
                        // from the server and locked.
                        binding.payButton.postDelayed({ returnToTools4Care() }, 900L)
                    } else {
                        binding.payButton.text = "Try again"
                        binding.payButton.isEnabled = true
                    }
                }
            },
          ).also { it.start() }
        }
    }

    private fun returnToTools4Care() {
        val returnUrl = bootstrap?.returnUrl
        if (!returnUrl.isNullOrBlank()) {
            runCatching {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(returnUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                })
            }
        }
        finishAndRemoveTask()
    }

    private fun cancelAndFinish() {
        val token = companionToken
        if (token == null) return finish()
        lifecycleScope.launch {
            runCatching { withContext(Dispatchers.IO) { CompanionApi(token).cancel() } }
            finish()
        }
    }
}
