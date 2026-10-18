package com.cherrychits.mobile;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.widget.Toast;
import android.view.WindowInsets;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.FragmentActivity;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

public final class MainActivity extends FragmentActivity {
    private static final String APP_URL = "https://cherry-chits-business-manager.netlify.app/";
    private static final String APP_HOST = "cherry-chits-business-manager.netlify.app";
    private static final int CONTACT_PICKER_REQUEST = 1001;
    private static final String PREFERENCES_NAME = "cherry_chits_preferences";
    private static final String BIOMETRIC_ENABLED = "biometric_unlock_enabled";

    private WebView webView;
    private boolean contactPickerOpen;
    private SharedPreferences preferences;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(4, 120, 87));
        getWindow().setNavigationBarColor(Color.rgb(15, 23, 42));
        preferences = getSharedPreferences(PREFERENCES_NAME, MODE_PRIVATE);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.addJavascriptInterface(new ContactsBridge(), "AndroidContacts");
        webView.addJavascriptInterface(new BiometricBridge(), "AndroidBiometric");
        webView.setBackgroundColor(Color.rgb(15, 23, 42));
        webView.setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(
                    insets.getSystemWindowInsetLeft(),
                    insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(),
                    insets.getSystemWindowInsetBottom());
            return insets;
        });

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleNavigation(request.getUrl().toString());
            }

            @SuppressWarnings("deprecation")
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleNavigation(url);
            }
        });
        setContentView(webView);

        if (preferences.getBoolean(BIOMETRIC_ENABLED, false)) {
            if (canAuthenticateBiometrically()) {
                showBiometricPrompt(false);
            } else {
                preferences.edit().putBoolean(BIOMETRIC_ENABLED, false).apply();
                loadApp(true);
            }
        } else {
            loadApp(false, savedInstanceState);
        }
    }

    private final class BiometricBridge {
        @JavascriptInterface
        public boolean isAvailable() {
            return canAuthenticateBiometrically();
        }

        @JavascriptInterface
        public boolean isEnabled() {
            return preferences.getBoolean(BIOMETRIC_ENABLED, false);
        }

        @JavascriptInterface
        public void enable() {
            runOnUiThread(() -> {
                if (!isTrustedAppPage()) {
                    return;
                }
                if (!canAuthenticateBiometrically()) {
                    notifyBiometricSetup(false, "Set up fingerprint unlock in Android settings first.");
                    return;
                }
                showBiometricPrompt(true);
            });
        }

        @JavascriptInterface
        public void disable() {
            runOnUiThread(() -> {
                if (!isTrustedAppPage()) {
                    return;
                }
                preferences.edit().putBoolean(BIOMETRIC_ENABLED, false).apply();
                notifyBiometricSetup(false, "Fingerprint unlock is disabled.");
            });
        }
    }

    private boolean canAuthenticateBiometrically() {
        return BiometricManager.from(this).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                == BiometricManager.BIOMETRIC_SUCCESS;
    }

    private boolean isTrustedAppPage() {
        Uri pageUri = Uri.parse(webView == null || webView.getUrl() == null ? "" : webView.getUrl());
        return "https".equalsIgnoreCase(pageUri.getScheme())
                && APP_HOST.equalsIgnoreCase(pageUri.getHost());
    }

    private void loadApp(boolean requirePasswordLogin) {
        loadApp(requirePasswordLogin, null);
    }

    private void loadApp(boolean requirePasswordLogin, Bundle savedInstanceState) {
        if (webView == null) {
            return;
        }
        if (requirePasswordLogin) {
            webView.loadUrl(APP_URL + "?reauth=1");
        } else if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(APP_URL);
        }
    }

    private void notifyBiometricSetup(boolean enabled, String message) {
        if (webView == null) {
            return;
        }
        String script = "window.onAndroidBiometricSetup && window.onAndroidBiometricSetup("
                + enabled + "," + JSONObject.quote(message) + ");";
        webView.evaluateJavascript(script, null);
    }

    private void showBiometricPrompt(boolean enabling) {
        BiometricPrompt prompt = new BiometricPrompt(
                this,
                ContextCompat.getMainExecutor(this),
                new BiometricPrompt.AuthenticationCallback() {
                    @Override
                    public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                        if (enabling) {
                            preferences.edit().putBoolean(BIOMETRIC_ENABLED, true).apply();
                            notifyBiometricSetup(true, "Fingerprint unlock is enabled on this phone.");
                        } else {
                            loadApp(false);
                        }
                    }

                    @Override
                    public void onAuthenticationError(int errorCode, CharSequence errString) {
                        if (enabling) {
                            notifyBiometricSetup(false, errString.toString());
                            return;
                        }
                        if (errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                            preferences.edit().putBoolean(BIOMETRIC_ENABLED, false).apply();
                            loadApp(true);
                        } else {
                            Toast.makeText(MainActivity.this, errString, Toast.LENGTH_LONG).show();
                            webView.postDelayed(() -> showBiometricPrompt(false), 700);
                        }
                    }

                    @Override
                    public void onAuthenticationFailed() {
                        Toast.makeText(MainActivity.this, "Fingerprint not recognized. Try again.", Toast.LENGTH_SHORT).show();
                    }
                });
        BiometricPrompt.PromptInfo promptInfo = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(enabling ? "Enable fingerprint unlock" : "Unlock Cherry Chits")
                .setSubtitle(enabling
                        ? "Confirm your fingerprint to protect this signed-in session"
                        : "Use your fingerprint to open your saved session")
                .setNegativeButtonText(enabling ? "Cancel" : "Use email and password")
                .build();
        prompt.authenticate(promptInfo);
    }

    private boolean handleNavigation(String url) {
        Uri uri = Uri.parse(url);
        if ("https".equalsIgnoreCase(uri.getScheme()) && APP_HOST.equalsIgnoreCase(uri.getHost())) {
            return false;
        }

        if ("https".equalsIgnoreCase(uri.getScheme())) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
            } catch (ActivityNotFoundException ignored) {
                Toast.makeText(this, "No browser is available to open this link.", Toast.LENGTH_SHORT).show();
            }
        }
        return true;
    }

    private final class ContactsBridge {
        @JavascriptInterface
        public void pickContact() {
            runOnUiThread(() -> {
                Uri pageUri = Uri.parse(webView.getUrl() == null ? "" : webView.getUrl());
                if (!"https".equalsIgnoreCase(pageUri.getScheme())
                        || !APP_HOST.equalsIgnoreCase(pageUri.getHost())
                        || contactPickerOpen) {
                    return;
                }

                Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                contactPickerOpen = true;
                try {
                    startActivityForResult(intent, CONTACT_PICKER_REQUEST);
                } catch (ActivityNotFoundException error) {
                    Intent fallback = new Intent(Intent.ACTION_GET_CONTENT);
                    fallback.setType(ContactsContract.CommonDataKinds.Phone.CONTENT_ITEM_TYPE);
                    fallback.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    try {
                        startActivityForResult(
                                Intent.createChooser(fallback, "Choose a phone contact"),
                                CONTACT_PICKER_REQUEST);
                    } catch (ActivityNotFoundException fallbackError) {
                        contactPickerOpen = false;
                        Toast.makeText(
                                MainActivity.this,
                                "No contacts picker is available. You can enter the number manually.",
                                Toast.LENGTH_LONG).show();
                    }
                } catch (SecurityException error) {
                    contactPickerOpen = false;
                    Toast.makeText(
                            MainActivity.this,
                            "Android denied access to the selected contact. You can enter the number manually.",
                            Toast.LENGTH_LONG).show();
                }
            });
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != CONTACT_PICKER_REQUEST) {
            return;
        }
        contactPickerOpen = false;
        if (resultCode != RESULT_OK || data == null || data.getData() == null || webView == null) {
            return;
        }

        try (Cursor cursor = getContentResolver().query(
                data.getData(),
                new String[] {
                        ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
                        ContactsContract.CommonDataKinds.Phone.NUMBER
                },
                null,
                null,
                null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                Toast.makeText(this, "The selected contact has no phone number.", Toast.LENGTH_SHORT).show();
                return;
            }

            int nameColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int phoneColumn = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            if (phoneColumn < 0) {
                Toast.makeText(this, "The contact picker did not return a phone number.", Toast.LENGTH_SHORT).show();
                return;
            }
            String name = nameColumn >= 0 ? cursor.getString(nameColumn) : "";
            String phone = cursor.getString(phoneColumn);
            String script = "window.onAndroidContactSelected && window.onAndroidContactSelected("
                    + JSONObject.quote(name == null ? "" : name) + ","
                    + JSONObject.quote(phone == null ? "" : phone) + ");";
            webView.evaluateJavascript(script, null);
        } catch (SecurityException | IllegalArgumentException error) {
            Toast.makeText(this, "Could not read the selected contact.", Toast.LENGTH_SHORT).show();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        if (webView != null) {
            webView.saveState(outState);
        }
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
