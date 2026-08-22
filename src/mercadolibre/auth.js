const db = require('../database');

const ML_AUTH_URL = 'https://auth.mercadolibre.com.co/authorization';
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const ML_API_BASE = 'https://api.mercadolibre.com';

/**
 * Generate the OAuth 2.0 authorization URL for a specific account
 */
function getAuthUrl(account) {
  if (!account || !account.app_id) {
    throw new Error('Cuenta no encontrada o sin App ID configurado.');
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: account.app_id,
    redirect_uri: account.redirect_uri || 'http://localhost:3000/auth/callback',
    state: String(account.id),
  });
  return `${ML_AUTH_URL}?${params.toString()}`;
}

/**
 * Exchange authorization code for access/refresh tokens for a specific account
 */
async function exchangeCodeForToken(code, accountId) {
  const account = db.getAccountById(accountId);
  if (!account) throw new Error(`Cuenta ID ${accountId} no encontrada.`);

  const response = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: account.app_id,
      client_secret: account.secret_key,
      code: code,
      redirect_uri: account.redirect_uri || 'http://localhost:3000/auth/callback',
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`Token exchange failed for ${account.name}: ${response.status} — ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    user_id: String(data.user_id || ''),
    seller_id: String(data.user_id || ''),
  };

  db.saveToken(account.id, tokenData);
  db.updateAccountSellerInfo(account.id, tokenData.seller_id, tokenData.user_id);
  db.logActivity('auth', `Autenticación exitosa para cuenta "${account.name}"`, { seller_id: tokenData.seller_id }, account.id);

  return tokenData;
}

/**
 * Refresh the access token using the refresh token for a specific account
 */
async function refreshAccessToken(accountId) {
  const account = db.getAccountById(accountId);
  if (!account) throw new Error(`Cuenta ID ${accountId} no encontrada.`);

  const token = db.getToken(accountId);
  if (!token) throw new Error(`No hay token guardado para la cuenta "${account.name}". Debes autenticarte primero.`);

  const response = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: account.app_id,
      client_secret: account.secret_key,
      refresh_token: token.refresh_token,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    db.logActivity('auth_error', `Error al refrescar token para "${account.name}"`, { error: err }, account.id);
    throw new Error(`Token refresh failed for ${account.name}: ${response.status} — ${JSON.stringify(err)}`);
  }

  const data = await response.json();
  const tokenData = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    user_id: token.user_id || account.user_id,
    seller_id: token.seller_id || account.seller_id,
  };

  db.saveToken(account.id, tokenData);
  return tokenData;
}

/**
 * Get a valid access token for an account, refreshing if necessary
 */
async function getValidToken(accountId) {
  let token = db.getToken(accountId);
  if (!token) {
    const account = db.getAccountById(accountId);
    throw new Error(`No hay token para la cuenta ${account ? `"${account.name}"` : accountId}. Por favor conéctala en Configuración.`);
  }

  // Refresh if token expires within 5 minutes
  if (Date.now() > (token.expires_at - 5 * 60 * 1000)) {
    const refreshed = await refreshAccessToken(accountId);
    return refreshed.access_token;
  }

  return token.access_token;
}

/**
 * Make an authenticated request to the Mercado Libre API for a given account
 */
async function mlFetch(endpoint, accountId, options = {}) {
  if (!accountId) {
    // If no accountId provided, fallback to first available account with token
    const accounts = db.getAccounts();
    const active = accounts.find(a => db.getToken(a.id));
    if (!active) throw new Error('No hay ninguna cuenta conectada a Mercado Libre.');
    accountId = active.id;
  }

  const accessToken = await getValidToken(accountId);
  const url = endpoint.startsWith('http') ? endpoint : `${ML_API_BASE}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(`ML API Error [${response.status}] ${endpoint}: ${JSON.stringify(err)}`);
  }

  return response.json();
}

/**
 * Get connection status for a specific account or all accounts
 */
function getConnectionStatus(accountId = null) {
  if (accountId) {
    const account = db.getAccountById(accountId);
    const token = db.getToken(accountId);
    if (!account) return { connected: false, reason: 'Cuenta no encontrada' };
    if (!token) return { connected: false, account_name: account.name, reason: 'Sin token' };

    const isExpired = Date.now() > token.expires_at;
    return {
      connected: !isExpired,
      account_id: account.id,
      account_name: account.name,
      seller_id: account.seller_id || token.seller_id,
      expires_at: new Date(token.expires_at).toISOString(),
      is_expired: isExpired,
    };
  }

  const accounts = db.getAccounts();
  return accounts.map(acc => {
    const token = db.getToken(acc.id);
    const isExpired = token ? Date.now() > token.expires_at : true;
    return {
      account_id: acc.id,
      account_name: acc.name,
      connected: !!token && !isExpired,
      seller_id: acc.seller_id || (token ? token.seller_id : null),
      is_expired: isExpired,
    };
  });
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  getValidToken,
  mlFetch,
  getConnectionStatus,
  ML_API_BASE,
};
