package com.tools4care.payments

import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

data class PaymentBootstrap(
    val sessionId: String,
    val customerName: String,
    val amountCents: Int,
    val saveRequested: Boolean,
    val saveOffered: Boolean,
    val clientSecret: String,
    val intentType: String,
    val stripeLocationId: String,
    val returnUrl: String,
)

class CompanionApi(private val companionToken: String) {
    private fun invoke(action: String, payload: JSONObject = JSONObject()): JSONObject {
        check(BuildConfig.SUPABASE_URL.isNotBlank() && BuildConfig.SUPABASE_ANON_KEY.isNotBlank()) {
            "The Android companion is not configured."
        }
        payload.put("companion_token", companionToken)
        val connection = URL("${BuildConfig.SUPABASE_URL}/functions/v1/terminal-payments").openConnection() as HttpURLConnection
        connection.requestMethod = "POST"
        connection.connectTimeout = 15_000
        connection.readTimeout = 30_000
        connection.doOutput = true
        connection.setRequestProperty("Content-Type", "application/json")
        connection.setRequestProperty("apikey", BuildConfig.SUPABASE_ANON_KEY)
        connection.setRequestProperty("Authorization", "Bearer ${BuildConfig.SUPABASE_ANON_KEY}")
        connection.outputStream.use { stream ->
            stream.write(JSONObject().put("action", action).put("payload", payload).toString().toByteArray())
        }
        val responseText = (if (connection.responseCode in 200..299) connection.inputStream else connection.errorStream)
            .bufferedReader().use { it.readText() }
        val response = JSONObject(responseText)
        if (connection.responseCode !in 200..299) error(response.optString("error", "Request failed"))
        return response
    }

    fun bootstrap(): PaymentBootstrap {
        val session = invoke("companion_bootstrap").getJSONObject("session")
        return PaymentBootstrap(
            sessionId = session.getString("id"),
            customerName = session.getString("customer_name"),
            amountCents = session.getInt("amount_cents"),
            saveRequested = session.getBoolean("save_requested"),
            saveOffered = session.getBoolean("save_offered"),
            clientSecret = session.getString("intent_client_secret"),
            intentType = session.getString("intent_type"),
            stripeLocationId = session.getString("stripe_location_id"),
            returnUrl = session.getString("return_url"),
        )
    }

    fun connectionToken(): String = invoke("connection_token").getString("secret")
    fun setSavePreference(accepted: Boolean): Boolean = invoke(
        "set_save_preference", JSONObject().put("accepted", accepted)
    ).getBoolean("save_requested")
    fun syncResult(): JSONObject = invoke("sync_result")
    fun cancel() { invoke("cancel_session") }
}
