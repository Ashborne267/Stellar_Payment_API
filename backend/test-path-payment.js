import { findMatchingPayment } from './src/lib/stellar.js';
import * as StellarSdk from 'stellar-sdk';

const testAccount = StellarSdk.Keypair.random().publicKey();

async function run() {
  console.log('Testing findMatchingPayment with mocked server');

  // We have to mock the Server instance. Unfortunately, `stellar.js` constructs its own
  // Server instance and does not export it. We'll mock the `global.fetch` to intercept 
  // the calls made by `StellarSdk.Horizon.Server`.
  
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.includes('/payments') && url.includes(testAccount)) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          _embedded: {
            records: [
              {
                id: '123',
                type: 'path_payment_strict_receive',
                transaction_hash: 'txhash_123',
                asset_type: 'credit_alphanum4',
                asset_code: 'USDC',
                asset_issuer: 'GBBD47IF6LWK7P7MDEVSCWTTCJMMAHILGA1ZLNEXEXCOMP',
                amount: '10.0000000',
                to: testAccount,
                from: 'G...',
              }
            ]
          }
        })
      };
    }
    
    if (url.includes('/accounts/' + testAccount)) {
       return {
         ok: true,
         status: 200,
         json: async () => ({
           id: testAccount,
           signers: [{ key: testAccount, weight: 1 }],
           thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 }
         })
       };
    }

    return originalFetch(url, options);
  };

  try {
    const payment = await findMatchingPayment({
      recipient: testAccount,
      amount: '10',
      assetCode: 'USDC',
      assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWTTCJMMAHILGA1ZLNEXEXCOMP',
      memo: null,
      memoType: null
    });

    console.log('Payment result:', payment);
    
    if (payment && payment.id === '123') {
        process.exit(0);
    } else {
        process.exit(1);
    }
  } catch (err) {
    console.error('Test error:', err);
    process.exit(1);
  } finally {
    global.fetch = originalFetch;
  }
}

run();
