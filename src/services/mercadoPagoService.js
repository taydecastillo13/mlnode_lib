const fs = require('fs');
const path = require('path');
const mercadoPago = require('mercadopago');

const configure = () => {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Missing MERCADO_PAGO_ACCESS_TOKEN environment variable');
  }
  mercadoPago.configure({ access_token: token });
};

configure();

const wrapResponse = (raw) => raw && (raw.body || raw.response || raw);

const MP_API_BASE = process.env.MERCADO_PAGO_API_BASE || 'https://api.mercadopago.com';
const DEFAULT_CURRENCY = process.env.MERCADO_PAGO_DEFAULT_CURRENCY || 'MXN';
const EXPECTED_SELLER_ID = process.env.MERCADO_PAGO_SELLER_ID;
const WEBHOOK_STORE_PATH =
  process.env.MERCADO_PAGO_WEBHOOK_STORE ||
  path.join(process.cwd(), 'data', 'mercadopago-webhooks.jsonl');

const unauthorizedStatus = new Set([401, 403]);
let sellerValidationPromise = null;

const validateSellerId = async () => {
  if (!EXPECTED_SELLER_ID) return;
  if (!sellerValidationPromise) {
    sellerValidationPromise = (async () => {
      const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
      const response = await fetch(`${MP_API_BASE}/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        const error = new Error('No se pudo validar el vendedor con /users/me.');
        error.status = response.status;
        throw error;
      }
      const sellerId = String(data?.id || '');
      if (sellerId !== String(EXPECTED_SELLER_ID)) {
        throw new Error(
          `El Access Token no corresponde al vendedor esperado. Esperado=${EXPECTED_SELLER_ID} Actual=${sellerId}`
        );
      }
    })();
  }
  return sellerValidationPromise;
};

const mpPlanRequest = async (method, path, payload) => {
  const token = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  const response = await fetch(`${MP_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.message || response.statusText;
    const details = data?.cause ? `: ${data.cause}` : '';
    const errorMessage = unauthorizedStatus.has(response.status)
      ? 'Credenciales de Mercado Pago inválidas o sin permisos (verifica token y país).'
      : `${message}${details}`;
    const error = new Error(errorMessage);
    error.status = response.status;
    throw error;
  }
  return data;
};

const buildAutoRecurring = (data = {}) => {
  const currency = DEFAULT_CURRENCY;
  const freeTrial =
    data.freeTrial ||
    data.free_trial ||
    (Number.isFinite(Number(data.freeTrialDays || data.free_trial_days))
      ? { frequency: Number(data.freeTrialDays || data.free_trial_days), frequency_type: 'days' }
      : undefined);
  const payload = {
    frequency: data.frequency || data.frequency_type ? data.frequency : 1,
    frequency_type: data.frequencyType || data.frequency_type || 'months',
    transaction_amount: Number(data.amount || data.price || 0),
    currency_id: currency,
    billing_day: data.billingDay || data.billing_day,
    end_date: data.endDate || data.end_date,
    free_trial: freeTrial,
    billing_day_proportional: data.billingDayProportional || data.billing_day_proportional,
    proportional_payment: data.proportionalPayment || data.proportional_payment,
  };
  return payload;
};

const cleanUrl = (value) => (typeof value === 'string' && value.trim() ? value.trim() : undefined);
const isAllowedReturnUrl = (value) => {
  if (!value) return false;
  if (!/^https:\/\//i.test(value)) return false;
  return !/^(https:\/\/)?(localhost|127\.0\.0\.1)(:|\/|$)/i.test(value);
};

const createPreference = async (payload) => {
  await validateSellerId();
  const successCandidate = cleanUrl(payload.successUrl) || cleanUrl(process.env.MERCADO_PAGO_SUCCESS_URL);
  const successUrl = isAllowedReturnUrl(successCandidate) ? successCandidate : undefined;
  const failureCandidate =
    cleanUrl(payload.failureUrl) || cleanUrl(process.env.MERCADO_PAGO_FAILURE_URL);
  const failureUrl = isAllowedReturnUrl(failureCandidate) ? failureCandidate : successUrl;
  const pendingCandidate =
    cleanUrl(payload.pendingUrl) || cleanUrl(process.env.MERCADO_PAGO_PENDING_URL);
  const pendingUrl = isAllowedReturnUrl(pendingCandidate) ? pendingCandidate : successUrl;
  const backUrls = {};
  if (successUrl) backUrls.success = successUrl;
  if (failureUrl) backUrls.failure = failureUrl;
  if (pendingUrl) backUrls.pending = pendingUrl;

  const preferencePayload = {
    items: [
      {
        title: payload.title || 'Mercado Pago Subscription',
        description: payload.description,
        quantity: payload.quantity || 1,
        currency_id: DEFAULT_CURRENCY,
        unit_price: Number(payload.price) || 0,
      },
    ],
    notification_url: payload.notificationUrl,
    back_urls: backUrls,
  };
  const payerEmail = cleanUrl(payload.payerEmail);
  if (payerEmail) {
    preferencePayload.payer = { email: payerEmail };
  }

  if (backUrls.success) {
    preferencePayload.auto_return = 'approved';
  }
  const response = await mercadoPago.preferences.create(preferencePayload);
  return wrapResponse(response);
};

const createPlan = async (data) => {
  if (data.raw && typeof data.raw === 'object') {
    return mpPlanRequest('POST', '/preapproval_plan', data.raw);
  }

  const planPayload = { ...data };

  if (!planPayload.reason && data.name) {
    planPayload.reason = data.name;
  }
  if (!planPayload.auto_recurring && data.autoRecurring) {
    planPayload.auto_recurring = data.autoRecurring;
  }
  if (!planPayload.auto_recurring && !data.autoRecurring) {
    planPayload.auto_recurring = buildAutoRecurring(data);
  }
  if (!planPayload.back_url && data.backUrl) {
    planPayload.back_url = data.backUrl;
  }

  if (!planPayload.back_url) {
    const backUrlCandidate = cleanUrl(data.backUrl) || cleanUrl(process.env.MERCADO_PAGO_BACK_URL);
    const backUrl = isAllowedReturnUrl(backUrlCandidate)
      ? backUrlCandidate
      : isAllowedReturnUrl(cleanUrl(process.env.MERCADO_PAGO_SUCCESS_URL))
        ? cleanUrl(process.env.MERCADO_PAGO_SUCCESS_URL)
        : undefined;
    if (!backUrl) {
      throw new Error('back_url is required to create a plan (usa una URL https pública)');
    }
    planPayload.back_url = backUrl;
  }

  if (!planPayload.payer_email && data.payerEmail) {
    planPayload.payer_email = data.payerEmail;
  }
  if (!planPayload.payer_email) {
    const payerEmail = process.env.MERCADO_PAGO_DEFAULT_PAYER_EMAIL;
    if (payerEmail) planPayload.payer_email = payerEmail;
  }

  const response = await mpPlanRequest('POST', '/preapproval_plan', planPayload);
  return response;
};

const updatePlan = async (planId, updates) => {
  if (updates.raw && typeof updates.raw === 'object') {
    return mpPlanRequest('PUT', `/preapproval_plan/${planId}`, updates.raw);
  }

  const payload = { ...updates };

  if (!payload.reason && updates.name) payload.reason = updates.name;
  if (!payload.auto_recurring && updates.autoRecurring) payload.auto_recurring = updates.autoRecurring;
  if (!payload.back_url && updates.backUrl) payload.back_url = updates.backUrl;

  if (!payload.auto_recurring && !updates.autoRecurring) {
    const auto = {};
    if (updates.price || updates.amount) auto.transaction_amount = Number(updates.price || updates.amount);
    if (updates.currencyId) auto.currency_id = updates.currencyId;
    if (updates.frequency) auto.frequency = Number(updates.frequency);
    if (updates.frequencyType) auto.frequency_type = updates.frequencyType;
    if (updates.billingDay) auto.billing_day = updates.billingDay;
    if (updates.endDate) auto.end_date = updates.endDate;
    if (updates.freeTrial) auto.free_trial = updates.freeTrial;
    if (updates.proportionalPayment != null) auto.proportional_payment = updates.proportionalPayment;
    if (Object.keys(auto).length) payload.auto_recurring = auto;
  }

  const response = await mpPlanRequest('PUT', `/preapproval_plan/${planId}`, payload);
  return response;
};

const cancelPlan = async (planId) => {
  const response = await mpPlanRequest('PUT', `/preapproval_plan/${planId}`, { status: 'cancelled' });
  return { id: planId, status: response.status || 'cancelled' };
};

const listPlans = async () => mpPlanRequest('GET', '/preapproval_plan/search');

const getPlan = async (planId) => mpPlanRequest('GET', `/preapproval_plan/${planId}`);

const listSubscriptions = async (query = {}) => {
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.append(key, String(value));
  });

  const hasPagination = params.has('limit') || params.has('offset');
  if (hasPagination) {
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return mpPlanRequest('GET', `/preapproval/search${suffix}`);
  }

  const limit = 50;
  let offset = 0;
  let allResults = [];
  while (true) {
    const pageParams = new URLSearchParams(params);
    pageParams.set('limit', String(limit));
    pageParams.set('offset', String(offset));
    const response = await mpPlanRequest('GET', `/preapproval/search?${pageParams.toString()}`);
    const pageResults = Array.isArray(response?.results) ? response.results : [];
    allResults = allResults.concat(pageResults);
    if (pageResults.length < limit) {
      return {
        ...response,
        results: allResults,
        paging: { limit, offset: 0, total: allResults.length },
      };
    }
    offset += limit;
  }
};

const getPayment = async (paymentId) => {
  if (!paymentId) return null;
  const response = await mpPlanRequest('GET', `/v1/payments/${paymentId}`);
  return response;
};

const updateSubscription = async (subscriptionId, updates) => {
  if (updates.raw && typeof updates.raw === 'object') {
    return mpPlanRequest('PUT', `/preapproval/${subscriptionId}`, updates.raw);
  }
  const payload = {};
  if (updates.reason) payload.reason = updates.reason;
  if (updates.externalReference) payload.external_reference = updates.externalReference;
  if (updates.payerEmail) payload.payer_email = updates.payerEmail;
  if (updates.status) payload.status = updates.status;
  if (updates.cardTokenId) payload.card_token_id = updates.cardTokenId;
  if (updates.cardTokenIdSecondary) payload.card_token_id_secondary = updates.cardTokenIdSecondary;
  if (updates.paymentMethodIdSecondary) {
    payload.payment_method_id_secondary = updates.paymentMethodIdSecondary;
  }
  if (updates.autoRecurring) {
    payload.auto_recurring = updates.autoRecurring;
  } else {
    const auto = {};
    if (updates.transactionAmount != null) auto.transaction_amount = Number(updates.transactionAmount);
    if (updates.currencyId) auto.currency_id = updates.currencyId;
    if (updates.frequency) auto.frequency = Number(updates.frequency);
    if (updates.frequencyType) auto.frequency_type = updates.frequencyType;
    if (updates.billingDay) auto.billing_day = updates.billingDay;
    if (updates.endDate) auto.end_date = updates.endDate;
    if (updates.freeTrial) auto.free_trial = updates.freeTrial;
    if (updates.proportionalPayment != null) auto.proportional_payment = updates.proportionalPayment;
    if (Object.keys(auto).length) payload.auto_recurring = auto;
  }
  const response = await mpPlanRequest('PUT', `/preapproval/${subscriptionId}`, payload);
  return response;
};

const cancelSubscription = async (subscriptionId) => {
  const response = await mpPlanRequest('PUT', `/preapproval/${subscriptionId}`, { status: 'cancelled' });
  return { id: subscriptionId, status: response.status || 'cancelled' };
};

const createSubscription = async (data) => {
  if (!data.planId || !data.payerEmail) {
    throw new Error('planId and payerEmail are required to create a subscription');
  }

  const subscriptionPayload = {
    plan_id: data.planId,
    payer_email: data.payerEmail,
    card_token_id: data.cardToken,
    notification_url: data.notificationUrl,
    external_reference: data.subscriptionReference,
    application_fee: data.applicationFee,
    metadata: data.metadata,
  };

  const response = await mercadoPago.subscriptions.create(subscriptionPayload);
  return wrapResponse(response);
};

const tokenizeCard = async (cardPayload) => {
  if (!cardPayload.card_number || !cardPayload.expiration_month || !cardPayload.expiration_year) {
    throw new Error('Missing card_number, expiration_month or expiration_year');
  }
  const response = await mercadoPago.card.create(cardPayload);
  return wrapResponse(response);
};

const processWebhook = async (eventData, secret) => {
  const expectedSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;
  const providedSecret = secret && String(secret).trim();
  const shouldValidate = expectedSecret && !/^https?:\/\//i.test(expectedSecret);
  if (shouldValidate && providedSecret && expectedSecret !== providedSecret) {
    throw new Error('Webhook secret mismatch');
  }
  // Keep hooks idempotent: log once, rely on client to dedupe if needed.
  const body = eventData?.body || {};
  const query = eventData?.query || {};
  const headers = eventData?.headers || {};
  const paymentId = body?.data?.id || query['data.id'];
  let paymentDetails = null;
  if (String(query.type || body.type || '').includes('payment') && paymentId) {
    try {
      paymentDetails = await getPayment(paymentId);
    } catch {
      paymentDetails = null;
    }
  }
  const paymentStatus = paymentDetails?.status;
  const paymentRejected =
    paymentStatus === 'rejected' ||
    paymentDetails?.status_detail?.includes('rejected') ||
    paymentDetails?.status_detail?.includes('cc_rejected');

  const payload = {
    received: Date.now(),
    event: body.type || body.action || query.type || query.topic || 'untyped',
    action: body.action || query.action,
    data: body.data || body.resource,
    raw: body,
    query,
    headers,
    full: eventData,
    payment: paymentDetails,
    payment_rejected: Boolean(paymentRejected),
  };
  const dir = path.dirname(WEBHOOK_STORE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.appendFileSync(WEBHOOK_STORE_PATH, `${JSON.stringify(payload)}\n`, 'utf8');
  return payload;
};

const listWebhooks = async (limit = 50) => {
  if (!fs.existsSync(WEBHOOK_STORE_PATH)) return [];
  const raw = fs.readFileSync(WEBHOOK_STORE_PATH, 'utf8').trim();
  if (!raw) return [];
  const lines = raw.split('\n').slice(-limit);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
};

module.exports = {
  createPlan,
  updatePlan,
  cancelPlan,
  listPlans,
  getPlan,
  listSubscriptions,
  updateSubscription,
  cancelSubscription,
  createPreference,
  createSubscription,
  tokenizeCard,
  processWebhook,
  listWebhooks,
};
