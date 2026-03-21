/**
 * TeleTime POS - MOTO (Mail Order/Telephone Order) Payment
 *
 * Full card-not-present entry form with:
 * - Employee authorization gate
 * - Card number (Luhn), expiry (future), CVV (brand-specific length)
 * - Cardholder name, billing address (Canadian provinces)
 * - Delivery address with divergence warning
 * - Callback phone, callback verification workflow (> threshold)
 * - Per-employee and store-wide amount limits
 * - AVS/CVV result display after authorization
 * - Manager PIN approval for over-limit amounts
 */

import { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../../utils/formatters';
import { AlertTriangle, CheckCircle, CreditCard, Lock, Phone, ShieldAlert, XCircle } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const PROVINCES = [
  { code: 'AB', name: 'Alberta' }, { code: 'BC', name: 'British Columbia' },
  { code: 'MB', name: 'Manitoba' }, { code: 'NB', name: 'New Brunswick' },
  { code: 'NL', name: 'Newfoundland & Labrador' }, { code: 'NS', name: 'Nova Scotia' },
  { code: 'NT', name: 'Northwest Territories' }, { code: 'NU', name: 'Nunavut' },
  { code: 'ON', name: 'Ontario' }, { code: 'PE', name: 'Prince Edward Island' },
  { code: 'QC', name: 'Quebec' }, { code: 'SK', name: 'Saskatchewan' },
  { code: 'YT', name: 'Yukon' },
];

function luhnCheck(num) {
  const digits = num.replace(/\D/g, '');
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function detectBrand(num) {
  const n = num.replace(/\D/g, '');
  if (/^3[47]/.test(n)) return 'amex';
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^6(?:011|5)/.test(n)) return 'discover';
  return 'unknown';
}

function getToken() {
  return localStorage.getItem('pos_token') || localStorage.getItem('auth_token') || '';
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  return fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...options.headers },
  });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MOTOPayment({ amountDue, onComplete, onBack, customer }) {
  // Auth gate
  const [accessState, setAccessState] = useState('checking'); // checking | authorized | denied
  const [accessMessage, setAccessMessage] = useState('');
  const [limits, setLimits] = useState({ employee: 2000, store: 5000, callbackThreshold: 500 });

  // Form fields
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [callbackPhone, setCallbackPhone] = useState('');

  // Billing address
  const [billingStreetNum, setBillingStreetNum] = useState('');
  const [billingStreetName, setBillingStreetName] = useState('');
  const [billingCity, setBillingCity] = useState('');
  const [billingProvince, setBillingProvince] = useState('ON');
  const [billingPostal, setBillingPostal] = useState('');

  // Delivery address
  const [sameAsShipping, setSameAsShipping] = useState(true);
  const [deliveryStreetNum, setDeliveryStreetNum] = useState('');
  const [deliveryStreetName, setDeliveryStreetName] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryProvince, setDeliveryProvince] = useState('ON');
  const [deliveryPostal, setDeliveryPostal] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('delivery');

  // State
  const [errors, setErrors] = useState({});
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null); // AVS/CVV results
  const [error, setError] = useState(null);

  // Manager approval
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerPin, setManagerPin] = useState('');
  const [limitMessage, setLimitMessage] = useState('');

  // Callback verification
  const [pendingCallback, setPendingCallback] = useState(null);
  const [callbackVerified, setCallbackVerified] = useState(false);

  // Saved cards
  const [savedCards, setSavedCards] = useState([]);
  const [selectedSavedCard, setSelectedSavedCard] = useState(null);
  const [useSavedCard, setUseSavedCard] = useState(false);

  // Derived
  const brand = detectBrand(cardNumber);
  const expectedCvvLen = brand === 'amex' ? 4 : 3;

  // Check address divergence
  const addressDivergent = !sameAsShipping &&
    billingCity.toLowerCase().trim() !== deliveryCity.toLowerCase().trim() &&
    deliveryCity.trim().length > 0;

  // -----------------------------------------------------------------------
  // Access check on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    apiFetch('/moto/access-check')
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.data.authorized) {
          setAccessState('authorized');
          setLimits({
            employee: data.data.employeeLimit,
            store: data.data.storeLimit,
            callbackThreshold: data.data.callbackThreshold,
          });
        } else {
          setAccessState('denied');
          setAccessMessage(data.data?.reason || 'MOTO access requires authorization. Contact your manager.');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAccessState('denied');
          setAccessMessage('Unable to verify MOTO authorization. Please try again.');
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Fetch saved cards when customer is linked
  useEffect(() => {
    if (!customer?.id) return;
    let cancelled = false;
    apiFetch(`/customers/${customer.id}/payment-methods`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.success && data.data?.length > 0) {
          setSavedCards(data.data.filter(c => !c.is_expired));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customer?.id]);

  // -----------------------------------------------------------------------
  // Validation
  // -----------------------------------------------------------------------
  const validate = useCallback(() => {
    const errs = {};
    const digits = cardNumber.replace(/\D/g, '');

    if (digits.length < 13 || digits.length > 19) errs.cardNumber = 'Card number must be 13-19 digits';
    else if (!luhnCheck(digits)) errs.cardNumber = 'Invalid card number (Luhn check failed)';

    if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(expiryDate)) {
      errs.expiryDate = 'Format: MM/YY';
    } else {
      const [mm, yy] = expiryDate.split('/').map(Number);
      const now = new Date();
      if (2000 + yy < now.getFullYear() || (2000 + yy === now.getFullYear() && mm < now.getMonth() + 1)) {
        errs.expiryDate = 'Card is expired';
      }
    }

    if (cvv.length !== expectedCvvLen) {
      errs.cvv = `CVV must be ${expectedCvvLen} digits for ${brand === 'amex' ? 'Amex' : 'this card'}`;
    }

    if (cardholderName.trim().length < 2) errs.cardholderName = 'Cardholder name required';
    if (!/^\d{10,11}$/.test(callbackPhone.replace(/\D/g, ''))) errs.callbackPhone = 'Phone must be 10-11 digits';

    if (!billingStreetNum.trim()) errs.billingStreetNum = 'Required';
    if (!billingStreetName.trim()) errs.billingStreetName = 'Required';
    if (!billingCity.trim()) errs.billingCity = 'Required';
    if (!/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(billingPostal)) errs.billingPostal = 'Format: A1A 1A1';

    if (!sameAsShipping) {
      if (!deliveryStreetNum.trim()) errs.deliveryStreetNum = 'Required';
      if (!deliveryStreetName.trim()) errs.deliveryStreetName = 'Required';
      if (!deliveryCity.trim()) errs.deliveryCity = 'Required';
      if (!/^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/.test(deliveryPostal)) errs.deliveryPostal = 'Format: A1A 1A1';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [cardNumber, expiryDate, cvv, expectedCvvLen, brand, cardholderName, callbackPhone,
      billingStreetNum, billingStreetName, billingCity, billingPostal,
      sameAsShipping, deliveryStreetNum, deliveryStreetName, deliveryCity, deliveryPostal]);

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------
  const handleSavedCardCharge = async () => {
    if (!selectedSavedCard || !customer?.id) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await apiFetch(`/customers/${customer.id}/payment-methods/${selectedSavedCard.id}/charge`, {
        method: 'POST',
        body: JSON.stringify({ amountCents: Math.round(amountDue * 100) }),
      });
      const data = await res.json();
      if (data.success && data.data.success) {
        onComplete({
          paymentMethod: 'credit',
          amount: amountDue,
          cardLastFour: data.data.lastFour,
          cardBrand: data.data.cardBrand,
          authorizationCode: data.data.authCode,
          cardEntryMethod: 'vault_token',
          card_entry_method: 'vault_token',
        });
      } else {
        setError(data.data?.message || data.error || 'Saved card charge failed');
      }
    } catch {
      setError('Network error processing saved card charge');
    }
    setProcessing(false);
  };

  const handleSubmit = async (overrideManagerId = null) => {
    // Saved card path
    if (useSavedCard && selectedSavedCard) {
      return handleSavedCardCharge();
    }

    if (!validate()) return;

    // Check limits
    if (amountDue > limits.store && !overrideManagerId) {
      setLimitMessage(`This MOTO transaction of ${formatCurrency(amountDue)} exceeds the store-wide limit of ${formatCurrency(limits.store)}. Owner/admin PIN required.`);
      setShowManagerPin(true);
      return;
    }
    if (amountDue > limits.employee && !overrideManagerId) {
      setLimitMessage(`This MOTO transaction of ${formatCurrency(amountDue)} exceeds your limit of ${formatCurrency(limits.employee)}. Manager PIN required.`);
      setShowManagerPin(true);
      return;
    }

    setProcessing(true);
    setError(null);

    const body = {
      shiftId: 1, // Will be overridden by cart context
      salespersonId: 1,
      items: [{ productId: 1, quantity: 1, unitPrice: amountDue }],
      payments: [{ paymentMethod: 'credit', amount: amountDue, cardEntryMethod: 'moto' }],
      totalAmount: amountDue,
      cardNumber: cardNumber.replace(/\D/g, ''),
      expiryDate,
      cvv,
      cardholderName: cardholderName.trim(),
      callbackPhone: callbackPhone.replace(/\D/g, ''),
      billingAddress: {
        streetNumber: billingStreetNum.trim(),
        streetName: billingStreetName.trim(),
        city: billingCity.trim(),
        province: billingProvince,
        postalCode: billingPostal.trim(),
      },
      customerId: customer?.id || null,
      callbackVerified: callbackVerified,
    };

    if (!sameAsShipping) {
      body.deliveryAddress = {
        streetNumber: deliveryStreetNum.trim(),
        streetName: deliveryStreetName.trim(),
        city: deliveryCity.trim(),
        province: deliveryProvince,
        postalCode: deliveryPostal.trim(),
      };
      body.deliveryMethod = deliveryMethod;
    }

    if (overrideManagerId) {
      body.fraudOverride = { managerId: overrideManagerId, managerPin };
    }

    try {
      const res = await apiFetch('/moto/process', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.error?.code === 'MOTO_EMPLOYEE_LIMIT' || data.error?.code === 'MOTO_STORE_LIMIT') {
          setLimitMessage(data.error);
          setShowManagerPin(true);
        } else {
          setError(data.error || data.message || 'MOTO transaction failed');
        }
        setProcessing(false);
        return;
      }

      // Check if callback is required
      if (data.data.status === 'pending_verification') {
        setPendingCallback(data.data);
        setProcessing(false);
        return;
      }

      // Show AVS/CVV results
      setResult(data.data);

      if (data.data.paymentDeclined) {
        setError('Payment was declined by the card issuer.');
        setProcessing(false);
        return;
      }

      // Complete the payment
      onComplete({
        paymentMethod: 'credit',
        amount: amountDue,
        cardLastFour: data.data.cardLastFour,
        cardBrand: data.data.cardBrand,
        authorizationCode: data.data.authorizationCode,
        cardEntryMethod: 'moto',
        card_entry_method: 'moto',
        motoOrderId: data.data.motoOrderId,
      });
    } catch (err) {
      setError('Network error processing MOTO transaction');
    }
    setProcessing(false);
  };

  // -----------------------------------------------------------------------
  // Manager PIN submission
  // -----------------------------------------------------------------------
  const handleManagerPinSubmit = async () => {
    if (managerPin.length < 4) return;
    // In a real implementation, validate PIN against manager accounts
    // For now, use a simulated manager ID
    setShowManagerPin(false);
    await handleSubmit(999); // Manager ID placeholder
  };

  // -----------------------------------------------------------------------
  // Callback verification
  // -----------------------------------------------------------------------
  const handleCallbackVerify = async () => {
    if (!pendingCallback) return;
    setProcessing(true);

    try {
      const res = await apiFetch(`/moto/callback-verify/${pendingCallback.motoOrderId}`, {
        method: 'PUT',
        body: JSON.stringify({ verified: true, notes: 'Callback completed, order verified by customer' }),
      });
      const data = await res.json();
      if (data.success) {
        setCallbackVerified(true);
        setPendingCallback(null);
        // Now re-submit with callbackVerified flag
        await handleSubmit();
      }
    } catch {
      setError('Callback verification failed');
    }
    setProcessing(false);
  };

  const handleCallbackCancel = async () => {
    if (!pendingCallback) return;
    try {
      await apiFetch(`/moto/callback-verify/${pendingCallback.motoOrderId}`, {
        method: 'PUT',
        body: JSON.stringify({ verified: false, notes: 'Customer could not be reached or did not confirm' }),
      });
    } catch { /* best effort */ }
    setPendingCallback(null);
    setError('MOTO order cancelled — callback verification failed');
  };

  // -----------------------------------------------------------------------
  // Access denied screen
  // -----------------------------------------------------------------------
  if (accessState === 'checking') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <div className="animate-spin h-8 w-8 border-2 border-indigo-600 border-t-transparent rounded-full mb-4" />
        <p className="text-gray-500">Verifying MOTO authorization...</p>
      </div>
    );
  }

  if (accessState === 'denied') {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <Lock className="w-16 h-16 text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">MOTO Access Restricted</h3>
        <p className="text-gray-600 text-center max-w-md mb-6">{accessMessage}</p>
        <button onClick={onBack} className="px-6 py-2 bg-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-300">
          Back to Payment Methods
        </button>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Callback verification screen
  // -----------------------------------------------------------------------
  if (pendingCallback) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-6 mb-4">
          <div className="flex items-start gap-3">
            <Phone className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-amber-800 mb-1">Callback Verification Required</h3>
              <p className="text-amber-700 text-sm mb-3">
                This MOTO order of {formatCurrency(amountDue)} requires customer callback verification before processing.
              </p>
              <div className="bg-white rounded-lg p-4 mb-3">
                {pendingCallback.crmPhoneAvailable ? (
                  <>
                    <p className="text-sm text-green-700 font-medium mb-1">
                      <CheckCircle className="w-4 h-4 inline mr-1" />
                      CRM Verified Number
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{pendingCallback.crmPhone}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      Customer-provided number: {pendingCallback.providedPhone}
                      {pendingCallback.crmPhone !== pendingCallback.providedPhone && (
                        <span className="text-red-600 font-medium ml-1">(differs from CRM)</span>
                      )}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-amber-700 font-medium mb-1">
                      <AlertTriangle className="w-4 h-4 inline mr-1" />
                      No CRM Phone On File — Verify Identity Carefully
                    </p>
                    <p className="text-2xl font-bold text-gray-900">{pendingCallback.providedPhone}</p>
                  </>
                )}
              </div>
              <p className="text-sm text-amber-700 font-medium">
                Call the customer and verify: order details, cardholder identity, and shipping address.
              </p>
            </div>
          </div>
        </div>

        {pendingCallback.addressDivergent && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span className="text-sm text-red-700">{pendingCallback.addressDivergenceDetail}</span>
          </div>
        )}

        <div className="flex gap-3 mt-auto">
          <button
            onClick={handleCallbackCancel}
            className="flex-1 py-3 bg-red-100 text-red-700 rounded-xl font-semibold hover:bg-red-200 transition-colors"
          >
            Cancel Order
          </button>
          <button
            onClick={handleCallbackVerify}
            disabled={processing}
            className="flex-1 py-3 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'I Have Verified This Order'}
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Manager PIN modal
  // -----------------------------------------------------------------------
  if (showManagerPin) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <ShieldAlert className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Manager Approval Required</h3>
        <p className="text-sm text-gray-600 text-center max-w-md mb-6">{limitMessage}</p>
        <input
          type="password"
          value={managerPin}
          onChange={e => setManagerPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Manager PIN"
          maxLength={6}
          className="w-48 text-center text-2xl tracking-widest py-3 border-2 border-gray-300 rounded-xl focus:border-indigo-500 focus:outline-none mb-4"
        />
        <div className="flex gap-3">
          <button onClick={() => { setShowManagerPin(false); setManagerPin(''); }} className="px-6 py-2 bg-gray-200 rounded-lg text-gray-700 font-medium hover:bg-gray-300">
            Cancel
          </button>
          <button onClick={handleManagerPinSubmit} disabled={managerPin.length < 4} className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
            Approve
          </button>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // AVS/CVV results screen
  // -----------------------------------------------------------------------
  if (result && !result.paymentDeclined) {
    return (
      <div className="flex flex-col h-full p-6">
        <div className="bg-green-50 border-2 border-green-200 rounded-xl p-6 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="text-lg font-semibold text-green-800">MOTO Transaction Authorized</h3>
          </div>
          <p className="text-sm text-green-700">
            Auth Code: <span className="font-mono font-bold">{result.authorizationCode}</span>
          </p>
        </div>

        {/* AVS/CVV Results */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <AVSResult label="AVS Result" result={result.avs} />
          <AVSResult label="CVV Result" result={result.cvv} />
        </div>

        {result.addressDivergent && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <span className="text-sm text-amber-700">
              Delivery address differs from billing: {result.addressDivergenceDetail}
            </span>
          </div>
        )}

        <p className="text-center text-sm text-gray-500">Payment has been completed.</p>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Main MOTO form
  // -----------------------------------------------------------------------
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-rose-50 border-b border-rose-100">
        <div className="flex items-center gap-2">
          <Phone className="w-5 h-5 text-rose-600" />
          <h3 className="font-semibold text-rose-800">MOTO Payment — Phone Order</h3>
        </div>
        <span className="text-lg font-bold text-gray-900">{formatCurrency(amountDue)}</span>
      </div>

      {error && (
        <div className="mx-4 mt-3 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{typeof error === 'string' ? error : error.message || JSON.stringify(error)}</span>
        </div>
      )}

      {/* Scrollable form */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

        {/* Saved Cards */}
        {savedCards.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-semibold text-blue-900">Saved Payment Methods</span>
            </div>
            <div className="space-y-2">
              {savedCards.map(card => (
                <label key={card.id}
                  className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                    selectedSavedCard?.id === card.id ? 'border-blue-500 bg-blue-100' : 'border-transparent hover:bg-blue-100'
                  }`}>
                  <input type="radio" name="savedCard" checked={selectedSavedCard?.id === card.id}
                    onChange={() => { setSelectedSavedCard(card); setUseSavedCard(true); }}
                    className="text-blue-600" />
                  <div className="flex-1 text-sm">
                    <span className="font-medium text-gray-900">
                      {card.card_brand?.toUpperCase()} ****{card.last_four}
                    </span>
                    <span className="text-gray-500 ml-2">Exp {card.display_expiry}</span>
                  </div>
                  {card.is_default && <span className="text-xs text-blue-600 font-medium">Default</span>}
                </label>
              ))}
              <label className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer border ${
                !useSavedCard ? 'border-blue-500 bg-blue-100' : 'border-transparent hover:bg-blue-100'
              }`}>
                <input type="radio" name="savedCard" checked={!useSavedCard}
                  onChange={() => { setSelectedSavedCard(null); setUseSavedCard(false); }}
                  className="text-blue-600" />
                <span className="text-sm font-medium text-gray-700">Enter new card manually</span>
              </label>
            </div>
          </div>
        )}

        {/* Card Information */}
        {!useSavedCard && (
        <fieldset className="border border-gray-200 rounded-lg p-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Card Information</legend>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-500">Card Number</label>
              <input
                type="text" value={cardNumber} maxLength={19}
                onChange={e => setCardNumber(e.target.value.replace(/[^\d\s]/g, ''))}
                placeholder="4111 1111 1111 1111"
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.cardNumber ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.cardNumber && <p className="text-xs text-red-500 mt-0.5">{errors.cardNumber}</p>}
              {brand !== 'unknown' && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {brand.charAt(0).toUpperCase() + brand.slice(1)} detected • CVV: {expectedCvvLen} digits
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-gray-500">Expiry (MM/YY)</label>
              <input
                type="text" value={expiryDate} maxLength={5}
                onChange={e => {
                  let v = e.target.value.replace(/[^\d/]/g, '');
                  if (v.length === 2 && !v.includes('/') && expiryDate.length < 2) v += '/';
                  setExpiryDate(v);
                }}
                placeholder="12/27"
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.expiryDate ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.expiryDate && <p className="text-xs text-red-500 mt-0.5">{errors.expiryDate}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-500">CVV</label>
              <input
                type="password" value={cvv} maxLength={4}
                onChange={e => setCvv(e.target.value.replace(/\D/g, ''))}
                placeholder={brand === 'amex' ? '1234' : '123'}
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.cvv ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.cvv && <p className="text-xs text-red-500 mt-0.5">{errors.cvv}</p>}
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">Cardholder Name</label>
              <input
                type="text" value={cardholderName}
                onChange={e => setCardholderName(e.target.value)}
                placeholder="John Doe"
                className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.cardholderName ? 'border-red-400' : 'border-gray-300'}`}
              />
              {errors.cardholderName && <p className="text-xs text-red-500 mt-0.5">{errors.cardholderName}</p>}
            </div>
          </div>
        </fieldset>
        )}

        {/* Billing Address */}
        <fieldset className="border border-gray-200 rounded-lg p-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Billing Address</legend>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="text-xs text-gray-500">Street #</label>
              <input type="text" value={billingStreetNum} onChange={e => setBillingStreetNum(e.target.value)}
                className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.billingStreetNum ? 'border-red-400' : 'border-gray-300'}`} />
            </div>
            <div className="col-span-3">
              <label className="text-xs text-gray-500">Street Name</label>
              <input type="text" value={billingStreetName} onChange={e => setBillingStreetName(e.target.value)}
                className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.billingStreetName ? 'border-red-400' : 'border-gray-300'}`} />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-500">City</label>
              <input type="text" value={billingCity} onChange={e => setBillingCity(e.target.value)}
                className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.billingCity ? 'border-red-400' : 'border-gray-300'}`} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Province</label>
              <select value={billingProvince} onChange={e => setBillingProvince(e.target.value)}
                className="w-full px-1 py-2 border border-gray-300 rounded-lg text-sm">
                {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Postal</label>
              <input type="text" value={billingPostal} maxLength={7}
                onChange={e => setBillingPostal(e.target.value.toUpperCase())}
                placeholder="M5V 1A1"
                className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.billingPostal ? 'border-red-400' : 'border-gray-300'}`} />
            </div>
          </div>
        </fieldset>

        {/* Delivery Address */}
        <fieldset className="border border-gray-200 rounded-lg p-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Delivery</legend>
          <label className="flex items-center gap-2 text-sm text-gray-700 mb-2 cursor-pointer">
            <input type="checkbox" checked={sameAsShipping} onChange={e => setSameAsShipping(e.target.checked)} className="rounded" />
            Same as billing address
          </label>

          {!sameAsShipping && (
            <>
              <div className="mb-2">
                <select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}
                  className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm">
                  <option value="delivery">Delivery</option>
                  <option value="pickup">In-Store Pickup</option>
                  <option value="ship">Ship</option>
                </select>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Street #</label>
                  <input type="text" value={deliveryStreetNum} onChange={e => setDeliveryStreetNum(e.target.value)}
                    className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.deliveryStreetNum ? 'border-red-400' : 'border-gray-300'}`} />
                </div>
                <div className="col-span-3">
                  <label className="text-xs text-gray-500">Street Name</label>
                  <input type="text" value={deliveryStreetName} onChange={e => setDeliveryStreetName(e.target.value)}
                    className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.deliveryStreetName ? 'border-red-400' : 'border-gray-300'}`} />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-500">City</label>
                  <input type="text" value={deliveryCity} onChange={e => setDeliveryCity(e.target.value)}
                    className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.deliveryCity ? 'border-red-400' : 'border-gray-300'}`} />
                </div>
                <div>
                  <label className="text-xs text-gray-500">Province</label>
                  <select value={deliveryProvince} onChange={e => setDeliveryProvince(e.target.value)}
                    className="w-full px-1 py-2 border border-gray-300 rounded-lg text-sm">
                    {PROVINCES.map(p => <option key={p.code} value={p.code}>{p.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500">Postal</label>
                  <input type="text" value={deliveryPostal} maxLength={7}
                    onChange={e => setDeliveryPostal(e.target.value.toUpperCase())}
                    placeholder="M5V 1A1"
                    className={`w-full px-2 py-2 border rounded-lg text-sm ${errors.deliveryPostal ? 'border-red-400' : 'border-gray-300'}`} />
                </div>
              </div>

              {addressDivergent && (
                <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <span className="text-xs text-amber-700">Delivery address differs from billing address (+5 fraud score)</span>
                </div>
              )}
            </>
          )}
        </fieldset>

        {/* Callback Phone */}
        <fieldset className="border border-gray-200 rounded-lg p-3">
          <legend className="text-xs font-semibold text-gray-500 uppercase px-1">Callback Phone</legend>
          <input
            type="tel" value={callbackPhone}
            onChange={e => setCallbackPhone(e.target.value)}
            placeholder="416-555-1234"
            className={`w-full px-3 py-2 border rounded-lg text-sm ${errors.callbackPhone ? 'border-red-400' : 'border-gray-300'}`}
          />
          {errors.callbackPhone && <p className="text-xs text-red-500 mt-0.5">{errors.callbackPhone}</p>}
          {amountDue > limits.callbackThreshold && (
            <p className="text-xs text-amber-600 mt-1">
              Orders over {formatCurrency(limits.callbackThreshold)} require callback verification before authorization.
            </p>
          )}
        </fieldset>

        {/* Limit warnings */}
        {amountDue > limits.employee && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <span className="text-sm text-amber-700">
              Amount exceeds your MOTO limit of {formatCurrency(limits.employee)} — manager approval will be required.
            </span>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex gap-3 px-4 py-3 border-t border-gray-200 bg-gray-50">
        <button
          onClick={onBack}
          disabled={processing}
          className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-xl font-semibold hover:bg-gray-300 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => handleSubmit()}
          disabled={processing}
          className="flex-1 py-3 bg-rose-600 text-white rounded-xl font-semibold hover:bg-rose-700 transition-colors disabled:opacity-50"
        >
          {processing ? 'Processing...' : `Charge ${formatCurrency(amountDue)}`}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AVS/CVV Result display component
// ---------------------------------------------------------------------------

function AVSResult({ label, result }) {
  if (!result) return null;

  const severityStyles = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-amber-50 border-amber-200 text-amber-800',
    danger: 'bg-red-50 border-red-200 text-red-800',
  };

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-green-600" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    danger: <XCircle className="w-5 h-5 text-red-500" />,
  };

  return (
    <div className={`p-3 rounded-lg border ${severityStyles[result.severity] || severityStyles.warning}`}>
      <p className="text-xs font-medium text-gray-500 mb-1">{label}</p>
      <div className="flex items-center gap-2">
        {icons[result.severity]}
        <span className="text-sm font-semibold">{result.message}</span>
      </div>
      <p className="text-xs text-gray-500 mt-1">Code: {result.code}</p>
    </div>
  );
}
