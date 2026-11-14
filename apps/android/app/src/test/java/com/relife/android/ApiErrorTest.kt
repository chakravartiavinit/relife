package com.relife.android

import com.relife.android.api.apiErrorFor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ApiErrorTest {
    @Test fun readsTheContractsErrorBody() {
        val e = apiErrorFor(401, """{"ok":false,"error":{"code":"revoked","message":"This device was disconnected."}}""")
        assertEquals("revoked", e.code)
        assertEquals("This device was disconnected.", e.message)
        assertTrue(e.signedOut)
    }

    @Test fun aBodyThatIsNotOursIsNotASignOut() {
        val html = apiErrorFor(401, "<html>Please log in to the proxy</html>")
        assertEquals("http_401", html.code)
        assertFalse(html.signedOut)
        assertFalse(apiErrorFor(401, "").signedOut)
    }

    @Test fun aForbiddenAnswerKeepsTheToken() {
        val e = apiErrorFor(403, """{"ok":false,"error":{"code":"forbidden","message":"This device isn't allowed to do that."}}""")
        assertEquals("forbidden", e.code)
        assertFalse(e.signedOut)
    }
}
