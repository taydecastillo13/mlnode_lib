const mercadoPagoService = require('../services/mercadoPagoService');
const asyncWrapper = require('../utils/asyncWrapper');

const respond = (res, payload) => {
  const status = payload.status || 200;
  if (status === 204) {
    return res.status(status).send();
  }
  return res.status(status).json(payload.body);
};

exports.getHealth = (req, res) => res.json({ status: 'ok', source: 'payments' });

exports.createPlan = asyncWrapper(async (req, res) => {
  const body = req.body;
  const response = await mercadoPagoService.createPlan(body);
  respond(res, { status: 201, body: response });
});

exports.updatePlan = asyncWrapper(async (req, res) => {
  const { planId } = req.params;
  const data = req.body;
  const currentPlan = await mercadoPagoService.getPlan(planId);
  if (currentPlan.status === 'cancelled') {
    const err = new Error('Plan cancelled');
    err.status = 422;
    throw err;
  }
  const response = await mercadoPagoService.updatePlan(planId, data);
  respond(res, { status: 200, body: response });
});

exports.cancelPlan = asyncWrapper(async (req, res) => {
  const { planId } = req.params;
  await mercadoPagoService.cancelPlan(planId);
  respond(res, { status: 204, body: {} });
});

exports.createSubscription = asyncWrapper(async (req, res) => {
  const payload = req.body;
  const response = await mercadoPagoService.createSubscription(payload);
  respond(res, { status: 201, body: response });
});

exports.tokenizeCard = asyncWrapper(async (req, res) => {
  const cardPayload = req.body;
  const response = await mercadoPagoService.tokenizeCard(cardPayload);
  respond(res, { status: 201, body: response });
});

exports.listPlans = asyncWrapper(async (req, res) => {
  const response = await mercadoPagoService.listPlans();
  respond(res, { status: 200, body: response });
});

exports.listSubscriptions = asyncWrapper(async (req, res) => {
  const response = await mercadoPagoService.listSubscriptions();
  const { status, active } = req.query;
  if (response && Array.isArray(response.results)) {
    let results = response.results;
    if (active === 'true' || active === '1') {
      results = results.filter((s) => s.status === 'authorized' || s.status === 'active');
    }
    if (status) {
      results = results.filter((s) => s.status === status);
    }
    const payload = {
      ...response,
      results,
      paging: response.paging ? { ...response.paging, total: results.length } : response.paging,
    };
    return respond(res, { status: 200, body: payload });
  }
  respond(res, { status: 200, body: response });
});

exports.updateSubscription = asyncWrapper(async (req, res) => {
  const { subscriptionId } = req.params;
  const updates = req.body;
  const response = await mercadoPagoService.updateSubscription(subscriptionId, updates);
  respond(res, { status: 200, body: response });
});

exports.cancelSubscription = asyncWrapper(async (req, res) => {
  const { subscriptionId } = req.params;
  await mercadoPagoService.cancelSubscription(subscriptionId);
  respond(res, { status: 204, body: {} });
});

exports.getPlanById = asyncWrapper(async (req, res) => {
  const { planId } = req.params;
  const response = await mercadoPagoService.getPlan(planId);
  respond(res, { status: 200, body: response });
});

exports.createPreference = asyncWrapper(async (req, res) => {
  const payload = req.body;
  const response = await mercadoPagoService.createPreference(payload);
  respond(res, { status: 201, body: response });
});

exports.handleHook = asyncWrapper(async (req, res) => {
  const secret = req.headers['x-hook-secret'];
  const result = await mercadoPagoService.processWebhook(
    {
      body: req.body,
      query: req.query,
      headers: req.headers,
    },
    secret
  );
  respond(res, { status: 200, body: result });
});

exports.listWebhooks = asyncWrapper(async (req, res) => {
  const limit = Number(req.query.limit || 50);
  const response = await mercadoPagoService.listWebhooks(limit);
  respond(res, { status: 200, body: response });
});
