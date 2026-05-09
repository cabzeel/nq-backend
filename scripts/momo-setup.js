/**
 * MTN MoMo — One-Time Setup Script
 * ─────────────────────────────────
 * Run this ONCE to generate your MOMO_API_USER and MOMO_API_KEY.
 * All you need beforehand is MOMO_SUBSCRIPTION_KEY in your .env file.
 *
 * Usage:
 *   1. Make sure MOMO_SUBSCRIPTION_KEY is set in backend/.env
 *   2. cd backend
 *   3. node scripts/momo-setup.js
 *   4. Copy the two printed values into your .env
 *   5. Never run this again for the same subscription key
 */

require('dotenv').config();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const SUBSCRIPTION_KEY = process.env.MOMO_SUBSCRIPTION_KEY;
const BASE_URL = process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com';

if (!SUBSCRIPTION_KEY || SUBSCRIPTION_KEY === 'paste_your_primary_or_secondary_key_here') {
  console.error('\n❌  MOMO_SUBSCRIPTION_KEY is not set in your .env file.');
  console.error('    Get it from: momodeveloper.mtn.com → Profile → Subscriptions\n');
  process.exit(1);
}

async function setup() {
  console.log('\n🔧  Generating MTN MoMo API User and API Key...\n');

  // ── Step 1: Create API User ───────────────────────────────────────────────
  // You supply a UUID — this becomes your permanent API User ID
  const apiUser = uuidv4();

  try {
    await axios.post(
      `${BASE_URL}/v1_0/apiuser`,
      { providerCallbackHost: process.env.MOMO_CALLBACK_URL || 'https://localhost' },
      {
        headers: {
          'X-Reference-Id': apiUser,
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log('✅  API User created.');
  } catch (err) {
    console.error('❌  Failed to create API User:');
    console.error(err.response?.data || err.message);
    process.exit(1);
  }

  // ── Step 2: Generate API Key for that user ────────────────────────────────
  let apiKey;
  try {
    const { data } = await axios.post(
      `${BASE_URL}/v1_0/apiuser/${apiUser}/apikey`,
      {},
      {
        headers: {
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        },
      }
    );
    apiKey = data.apiKey;
    console.log('✅  API Key generated.');
  } catch (err) {
    console.error('❌  Failed to generate API Key:');
    console.error(err.response?.data || err.message);
    process.exit(1);
  }

  // ── Step 3: Quick sanity check — get an access token ─────────────────────
  try {
    const credentials = Buffer.from(`${apiUser}:${apiKey}`).toString('base64');
    await axios.post(
      `${BASE_URL}/collection/token/`,
      {},
      {
        headers: {
          Authorization: `Basic ${credentials}`,
          'Ocp-Apim-Subscription-Key': SUBSCRIPTION_KEY,
        },
      }
    );
    console.log('✅  Access token verified — everything is working.\n');
  } catch {
    console.log('⚠️   Could not verify token, but credentials may still be valid.\n');
  }

  // ── Output ────────────────────────────────────────────────────────────────
  console.log('═'.repeat(58));
  console.log('  Copy these two lines into your backend/.env file:');
  console.log('═'.repeat(58));
  console.log(`\nMOMO_API_USER=${apiUser}`);
  console.log(`MOMO_API_KEY=${apiKey}\n`);
  console.log('═'.repeat(58));
  console.log('  ⚠️  Save these. You cannot retrieve them later.');
  console.log('═'.repeat(58) + '\n');
}

setup();