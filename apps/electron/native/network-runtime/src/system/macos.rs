//! CFNetwork ordered proxy dictionaries; SystemConfiguration contributes network identity to the digest.
use super::{Options, POLICY_ERROR, Route, Snapshot, UNAVAILABLE, pac};
use core_foundation::{base::TCFType, string::CFString};
use std::{ffi::c_void, ptr};
type Ref = *const c_void;

#[link(name = "CFNetwork", kind = "framework")]
unsafe extern "C" {
    fn CFNetworkCopySystemProxySettings() -> Ref;
    fn CFNetworkCopyProxiesForURL(url: Ref, settings: Ref) -> Ref;
    fn CFNetworkCopyProxiesForAutoConfigurationScript(
        script: Ref,
        url: Ref,
        error: *mut Ref,
    ) -> Ref;
    static kCFProxyTypeKey: Ref;
    static kCFProxyHostNameKey: Ref;
    static kCFProxyPortNumberKey: Ref;
    static kCFProxyAutoConfigurationURLKey: Ref;
    static kCFProxyAutoConfigurationJavaScriptKey: Ref;
    static kCFProxyTypeNone: Ref;
    static kCFProxyTypeHTTP: Ref;
    static kCFProxyTypeHTTPS: Ref;
    static kCFProxyTypeSOCKS: Ref;
    static kCFProxyTypeAutoConfigurationURL: Ref;
    static kCFProxyTypeAutoConfigurationJavaScript: Ref;
}
#[link(name = "CoreFoundation", kind = "framework")]
unsafe extern "C" {
    fn CFRelease(value: Ref);
    fn CFEqual(a: Ref, b: Ref) -> bool;
    fn CFGetTypeID(value: Ref) -> usize;
    fn CFDictionaryGetTypeID() -> usize;
    fn CFDictionaryGetValue(value: Ref, key: Ref) -> Ref;
    fn CFArrayGetTypeID() -> usize;
    fn CFArrayGetCount(array: Ref) -> isize;
    fn CFArrayGetValueAtIndex(array: Ref, index: isize) -> Ref;
    fn CFNumberGetTypeID() -> usize;
    fn CFNumberGetValue(number: Ref, kind: isize, value: *mut i64) -> bool;
    fn CFStringGetTypeID() -> usize;
    fn CFURLGetString(url: Ref) -> Ref;
    fn CFURLCreateWithString(allocator: Ref, string: Ref, base: Ref) -> Ref;
    fn CFURLGetTypeID() -> usize;
    fn CFPropertyListCreateData(
        allocator: Ref,
        value: Ref,
        format: isize,
        options: usize,
        error: *mut Ref,
    ) -> Ref;
    fn CFDataGetLength(data: Ref) -> isize;
    fn CFDataGetBytePtr(data: Ref) -> *const u8;
}
#[link(name = "SystemConfiguration", kind = "framework")]
unsafe extern "C" {
    fn SCDynamicStoreCopyValue(store: Ref, key: Ref) -> Ref;
}
struct Owned(Ref);
impl Owned {
    fn new(value: Ref) -> Result<Self, &'static str> {
        if value.is_null() {
            Err(POLICY_ERROR)
        } else {
            Ok(Self(value))
        }
    }
}
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe { CFRelease(self.0) }
    }
}
fn string(value: Ref) -> Result<String, &'static str> {
    unsafe {
        if value.is_null() || CFGetTypeID(value) != CFStringGetTypeID() {
            return Err(POLICY_ERROR);
        }
        Ok(CFString::wrap_under_get_rule(value.cast()).to_string())
    }
}
fn value(dict: Ref, key: Ref) -> Result<Ref, &'static str> {
    unsafe {
        if dict.is_null() || CFGetTypeID(dict) != CFDictionaryGetTypeID() {
            return Err(POLICY_ERROR);
        }
        let value = CFDictionaryGetValue(dict, key);
        if value.is_null() {
            Err(POLICY_ERROR)
        } else {
            Ok(value)
        }
    }
}
fn bytes(value: Ref) -> Result<Vec<u8>, &'static str> {
    let data = Owned::new(unsafe {
        CFPropertyListCreateData(ptr::null(), value, 200, 0, ptr::null_mut())
    })?;
    unsafe {
        Ok(
            std::slice::from_raw_parts(CFDataGetBytePtr(data.0), CFDataGetLength(data.0) as usize)
                .to_vec(),
        )
    }
}
fn enabled(settings: Ref, key: &str) -> bool {
    let key = CFString::new(key);
    value(settings, key.as_CFTypeRef())
        .ok()
        .and_then(|v| number(v).ok())
        .is_some_and(|n| n != 0)
}
fn number(value: Ref) -> Result<i64, &'static str> {
    let mut n = 0;
    unsafe {
        if CFGetTypeID(value) != CFNumberGetTypeID() || !CFNumberGetValue(value, 4, &mut n) {
            return Err(POLICY_ERROR);
        }
    }
    Ok(n)
}
fn array(array: Ref) -> Result<Vec<Ref>, &'static str> {
    unsafe {
        if CFGetTypeID(array) != CFArrayGetTypeID() {
            return Err(POLICY_ERROR);
        }
        let count = CFArrayGetCount(array);
        if !(1..=64).contains(&count) {
            return Err(POLICY_ERROR);
        }
        Ok((0..count)
            .map(|i| CFArrayGetValueAtIndex(array, i))
            .collect())
    }
}
fn final_route(dict: Ref) -> Result<Route, &'static str> {
    let kind = value(dict, unsafe { kCFProxyTypeKey })?;
    unsafe {
        if CFEqual(kind, kCFProxyTypeNone) {
            return Ok(Route::Direct);
        }
        let token = if CFEqual(kind, kCFProxyTypeHTTP) || CFEqual(kind, kCFProxyTypeHTTPS) {
            // HTTPS identifies the destination scheme; the proxy uses plain HTTP CONNECT.
            "HTTP"
        } else if CFEqual(kind, kCFProxyTypeSOCKS) {
            "SOCKS5"
        } else {
            return Err(POLICY_ERROR);
        };
        let host = string(value(dict, kCFProxyHostNameKey)?)?;
        let port = u16::try_from(number(value(dict, kCFProxyPortNumberKey)?)?)
            .map_err(|_| POLICY_ERROR)?;
        super::endpoint(token, &crate::connector::authority(&host, port))
    }
}
pub fn query(url: Option<&url::Url>, options: Options) -> Result<Snapshot, &'static str> {
    let settings =
        Owned::new(unsafe { CFNetworkCopySystemProxySettings() }).map_err(|_| UNAVAILABLE)?;
    let source = if enabled(settings.0, "ProxyAutoConfigEnable") {
        "pac"
    } else if enabled(settings.0, "ProxyAutoDiscoveryEnable") {
        "wpad"
    } else if ["HTTPEnable", "HTTPSEnable", "SOCKSEnable"]
        .iter()
        .any(|k| enabled(settings.0, k))
    {
        "manual"
    } else {
        "none"
    };
    let mut identity = bytes(settings.0)?;
    for key in [
        "State:/Network/Global/IPv4",
        "State:/Network/Global/IPv6",
        "State:/Network/Global/DNS",
    ] {
        let key = CFString::new(key);
        if let Ok(network) =
            Owned::new(unsafe { SCDynamicStoreCopyValue(ptr::null(), key.as_CFTypeRef()) })
        {
            identity.extend(bytes(network.0)?);
        }
    }
    let snapshot = Snapshot::new("macos-cfnetwork", source, identity);
    let Some(url) = url else {
        return Ok(snapshot);
    };
    if source == "pac" {
        let key = CFString::new("ProxyAutoConfigURLString");
        let configured = string(value(settings.0, key.as_CFTypeRef())?)?;
        let parsed = url::Url::parse(&configured).map_err(|_| "PAC_FETCH_FAILED")?;
        if !matches!(parsed.scheme(), "http" | "https")
            || parsed.host_str().is_none()
            || !parsed.username().is_empty()
            || parsed.password().is_some()
        {
            return Err("PAC_FETCH_FAILED");
        }
    }
    let target = CFString::new(url.as_str());
    let cf_url = Owned::new(unsafe {
        CFURLCreateWithString(ptr::null(), target.as_CFTypeRef(), ptr::null())
    })?;
    let proxies = Owned::new(unsafe { CFNetworkCopyProxiesForURL(cf_url.0, settings.0) })?;
    let dictionaries = array(proxies.0)?;
    let first = dictionaries[0];
    let kind = value(first, unsafe { kCFProxyTypeKey })?;
    unsafe {
        if CFEqual(kind, kCFProxyTypeAutoConfigurationURL)
            || CFEqual(kind, kCFProxyTypeAutoConfigurationJavaScript)
        {
            let script = if CFEqual(kind, kCFProxyTypeAutoConfigurationURL) {
                let pac_url = value(first, kCFProxyAutoConfigurationURLKey)?;
                if CFGetTypeID(pac_url) != CFURLGetTypeID() {
                    return Err(POLICY_ERROR);
                }
                let text = string(CFURLGetString(pac_url))?;
                pac::fetch(
                    &url::Url::parse(&text).map_err(|_| "PAC_FETCH_FAILED")?,
                    options,
                )?
            } else {
                string(value(first, kCFProxyAutoConfigurationJavaScriptKey)?)?
            };
            return snapshot.select(evaluate_script(&script, cf_url.0, options)?);
        }
    }
    // A configured autoproxy policy must not silently become a static fallback.
    if source == "wpad" || (source == "pac" && !unsafe { CFEqual(kind, kCFProxyTypeNone) }) {
        return Err(POLICY_ERROR);
    }
    snapshot.select(
        dictionaries
            .into_iter()
            .map(final_route)
            .collect::<Result<Vec<_>, _>>()?,
    )
}

fn evaluate_script(
    script: &str,
    target: Ref,
    options: Options,
) -> Result<Vec<Route>, &'static str> {
    if script.len() > options.pac_max_bytes {
        return Err("PAC_EVALUATION_FAILED");
    }
    // CFNetwork can discard an unrecognized PAC entry. Reject it before native parsing.
    let script = CFString::new(&format!(
        "{script}\n{}",
        r#"
        FindProxyForURL = (function(original) {
            return function(url, host) {
                var result = original(url, host);
                if (typeof result !== 'string' || result.length > 16384) throw 'invalid PAC result';
                var entries = result.trim().replace(/;$/, '').split(';');
                if (entries.length > 64) throw 'invalid PAC result';
                for (var i = 0; i < entries.length; i++) {
                    var entry = entries[i].trim();
                    if (entry === 'DIRECT') continue;
                    var match = /^(PROXY|HTTP|SOCKS|SOCKS5)\s+([a-zA-Z0-9.-]+|\[[a-fA-F0-9:]+\]):([0-9]+)$/.exec(entry);
                    if (!match || Number(match[3]) < 1 || Number(match[3]) > 65535) throw 'invalid PAC result';
                    entries[i] = (match[1] === 'HTTP' ? 'PROXY' : match[1] === 'SOCKS5' ? 'SOCKS' : match[1]) + ' ' + match[2] + ':' + match[3];
                }
                return entries.join(';');
            };
        })(FindProxyForURL);
    "#
    ));
    unsafe {
        let mut error = ptr::null();
        let result = CFNetworkCopyProxiesForAutoConfigurationScript(
            script.as_CFTypeRef(),
            target,
            &mut error,
        );
        if !error.is_null() {
            CFRelease(error);
            if !result.is_null() {
                CFRelease(result);
            }
            return Err("PAC_EVALUATION_FAILED");
        }
        let result = Owned::new(result).map_err(|_| "PAC_EVALUATION_FAILED")?;
        array(result.0)?.into_iter().map(final_route).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_pac_preserves_order_and_rejects_malformed_first_entry() {
        let text = CFString::new("https://example.invalid/");
        let url = Owned::new(unsafe {
            CFURLCreateWithString(ptr::null(), text.as_CFTypeRef(), ptr::null())
        })
        .unwrap();
        for (result, expected) in [
            (
                "PROXY first.example:8080; PROXY second.example:8081; DIRECT",
                vec![
                    Route::Http {
                        host: "first.example".into(),
                        port: 8080,
                    },
                    Route::Http {
                        host: "second.example".into(),
                        port: 8081,
                    },
                    Route::Direct,
                ],
            ),
            ("DIRECT", vec![Route::Direct]),
        ] {
            let script = format!("function FindProxyForURL() {{ return '{result}'; }}");
            assert_eq!(
                evaluate_script(&script, url.0, Options::default()).unwrap(),
                expected
            );
        }
        for result in [
            "BOGUS bad:80; DIRECT",
            "PROXY bad:0; DIRECT",
            "PROXY bad; DIRECT",
            "HTTPS secure.example:443; DIRECT",
        ] {
            let script = format!("function FindProxyForURL() {{ return '{result}'; }}");
            assert!(evaluate_script(&script, url.0, Options::default()).is_err());
        }
        assert!(evaluate_script("invalid {{{", url.0, Options::default()).is_err());
    }
}
