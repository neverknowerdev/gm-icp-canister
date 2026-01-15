# Setting Twitter API Configuration

The canister needs Twitter API credentials to verify Twitter auth codes. Follow these steps:

## Step 1: Get the Canister's Public Key

```bash
export DFX_WARNING=-mainnet_plaintext_identity
dfx canister call gm-account-manager-canister encryptionPublicKey --network ic --identity default
```

This will return a hex-encoded public key like: `"9339fc8f469d77dd8d87ba9ddeac8eb7e255857114afd083430e5e0004166045"`

## Step 2: Encrypt Your Twitter API Credentials

You need to encrypt three values:
- `tweetFetchURL`: The Twitter API endpoint (e.g., `"https://api.twitter.com/2/tweets"`)
- `headerName`: The HTTP header name (e.g., `"Authorization"`)
- `bearerToken`: Your Twitter Bearer token

The encryption uses:
- X25519 for key exchange
- AES-256-GCM for encryption
- HKDF-SHA256 for key derivation

## Step 3: Call setTwitterConfig

Once you have the encrypted values, call:

```bash
export DFX_WARNING=-mainnet_plaintext_identity
dfx canister call gm-account-manager-canister setTwitterConfig '(
  record {
    tweetFetchURLEncrypted = "<encrypted_url>";
    headerNameEncrypted = "<encrypted_header>";
    bearerTokenEncrypted = "<encrypted_token>";
  }
)' --network ic --identity default
```

## Quick Setup (if you have the encryption function available)

If you have a way to encrypt (e.g., using the encryption module from the canister code), you can create a simple script to do this automatically.

## Note

The Twitter API configuration is required for the `verifyTwitter` function to work. Without it, verification events will fail with "Twitter API configuration not initialized."

