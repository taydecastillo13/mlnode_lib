const express = require('express');
const {
  createPlan,
  updatePlan,
  cancelPlan,
  createSubscription,
  handleHook,
  tokenizeCard,
  getHealth,
  listPlans,
  listSubscriptions,
  updateSubscription,
  cancelSubscription,
  getPlanById,
  createPreference,
  listWebhooks,
} = require('../controllers/paymentController');

const router = express.Router();

router.get('/health', getHealth);
router.get('/plans', listPlans);
router.get('/subscriptions', listSubscriptions);
router.put('/subscriptions/:subscriptionId', updateSubscription);
router.delete('/subscriptions/:subscriptionId', cancelSubscription);
router.get('/plans/:planId', getPlanById);
router.post('/plans', createPlan);
router.post('/preferences', createPreference);
router.put('/plans/:planId', updatePlan);
router.delete('/plans/:planId', cancelPlan);
router.post('/subscriptions', createSubscription);
router.post('/tokenize', tokenizeCard);
router.post('/webhooks', handleHook);
router.get('/webhooks', listWebhooks);

module.exports = router;
