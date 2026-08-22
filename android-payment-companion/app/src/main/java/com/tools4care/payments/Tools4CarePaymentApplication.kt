package com.tools4care.payments

import android.app.Application
import com.stripe.stripeterminal.TerminalApplicationDelegate
import com.stripe.stripeterminal.taptopay.TapToPay

class Tools4CarePaymentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        if (TapToPay.isInTapToPayProcess()) return
        TerminalApplicationDelegate.onCreate(this)
    }
}
