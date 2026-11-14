package com.relife.android

import com.relife.android.pair.PairLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PairLinkTest {
    private val secret = "c2VjcmV0LWZyb20tdGhlLXFyLWZyYWdtZW50LTMyLWJ5dGVz"

    @Test fun readsTheWebPageQr() {
        val link = PairLink.parse("https://relife.example.com/pair#s=$secret")!!
        assertEquals("https://relife.example.com", link.server)
        assertEquals(secret, link.secret)
        assertTrue(link.encrypted)
    }

    @Test fun keepsPortsAndPlainHttpOnTheLan() {
        val link = PairLink.parse("http://192.168.1.20:3030/pair#s=$secret")!!
        assertEquals("http://192.168.1.20:3030", link.server)
        assertFalse(link.encrypted)
    }

    @Test fun dropsDefaultPorts() {
        assertEquals("https://mac.tail1234.ts.net", PairLink.parse("https://mac.tail1234.ts.net:443/pair#s=$secret")!!.server)
    }

    @Test fun readsTheMacLink() {
        val link = PairLink.parse("relife://pair?server=http%3A%2F%2F10.0.0.5%3A3030&s=$secret")!!
        assertEquals("http://10.0.0.5:3030", link.server)
        assertEquals(secret, link.secret)
    }

    @Test fun ignoresAnythingElse() {
        assertNull(PairLink.parse("https://example.com/"))
        assertNull(PairLink.parse("https://example.com/other#s=$secret"))
        assertNull(PairLink.parse("https://example.com/pair"))
        assertNull(PairLink.parse("https://example.com/pair#s=short"))
        assertNull(PairLink.parse("ftp://example.com/pair#s=$secret"))
        assertNull(PairLink.parse("WIFI:T:WPA;S:home;P:pw;;"))
        assertNull(PairLink.parse(""))
    }

    @Test fun typedAddressesGetTheRightScheme() {
        assertEquals("http://192.168.1.20:3030", PairLink.normalizeServer("192.168.1.20:3030"))
        assertEquals("http://100.101.102.103:3030", PairLink.normalizeServer("100.101.102.103:3030"))
        assertEquals("http://mymac.local:3030", PairLink.normalizeServer(" mymac.local:3030/ "))
        assertEquals("https://mac.tail1234.ts.net", PairLink.normalizeServer("mac.tail1234.ts.net"))
        assertEquals("https://relife.example.com", PairLink.normalizeServer("relife.example.com"))
        assertEquals("http://localhost:3030", PairLink.normalizeServer("http://localhost:3030"))
        assertEquals("https://relife.example.com", PairLink.normalizeServer("https://relife.example.com/some/path"))
    }

    @Test fun badTypedAddressesAreRefused() {
        assertNull(PairLink.normalizeServer(""))
        assertNull(PairLink.normalizeServer("two words"))
        assertNull(PairLink.normalizeServer("ftp://host"))
    }

    @Test fun privateHosts() {
        listOf("10.1.2.3", "192.168.0.9", "172.16.0.1", "172.31.255.1", "100.64.0.1", "100.127.0.1", "169.254.1.1", "127.0.0.1", "localhost", "x.local")
            .forEach { assertTrue(it, PairLink.isPrivateHost(it)) }
        listOf("8.8.8.8", "172.32.0.1", "100.128.0.1", "100.63.0.1", "192.169.0.1", "example.com", "1.2.3", "300.1.1.1")
            .forEach { assertFalse(it, PairLink.isPrivateHost(it)) }
    }
}
