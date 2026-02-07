import React, { useState, useEffect } from 'react';

import { authFetch } from '../services/authFetch';
const API_BASE = `${process.env.REACT_APP_API_URL || 'http://localhost:3001'}/api`;

// ============================================
// FINANCING CALCULATOR COMPONENT
// ============================================
export const FinancingCalculator = ({ quoteTotal, onFinancingSelected }) => {
  const [financingPlans, setFinancingPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [downPayment, setDownPayment] = useState(0);
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinancingPlans();
  }, [quoteTotal]);

  const fetchFinancingPlans = async () => {
    try {
      const response = await authFetch(`${API_BASE}/financing-plans?minPurchase=${quoteTotal}`);
      const data = await response.json();
      setFinancingPlans(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching financing plans:', error);
      setLoading(false);
    }
  };

  const calculatePayment = async (planId) => {
    if (!planId) return;

    try {
      const response = await authFetch(`${API_BASE}/financing-plans/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planId,
          purchaseAmountCents: quoteTotal,
          downPaymentCents: downPayment
        })
      });
      const data = await response.json();
      setCalculation(data.calculation);
      setSelectedPlan(data.plan);
    } catch (error) {
      console.error('Error calculating financing:', error);
    }
  };

  const formatCurrency = (cents) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const handleApplyFinancing = () => {
    if (selectedPlan && calculation) {
      onFinancingSelected({
        plan: selectedPlan,
        calculation: calculation
      });
    }
  };

  if (loading) return <div>Loading financing options...</div>;

  return (
    <div style={styles.featureContainer}>
      <h3 style={styles.featureTitle}>💳 Financing Options</h3>

      {quoteTotal < 50000 && (
        <div style={styles.warningBox}>
          Financing available for purchases over $500
        </div>
      )}

      <div style={styles.planGrid}>
        {financingPlans.map(plan => (
          <div
            key={plan.id}
            style={{
              ...styles.planCard,
              ...(selectedPlan?.id === plan.id ? styles.selectedPlan : {})
            }}
            onClick={() => calculatePayment(plan.id)}
          >
            <div style={styles.planName}>{plan.plan_name}</div>
            <div style={styles.planDetails}>
              {plan.apr_percent === 0 ? (
                <div style={styles.highlight}>0% APR</div>
              ) : (
                <div>{plan.apr_percent}% APR</div>
              )}
              <div style={styles.planTerm}>{plan.term_months} months</div>
            </div>
            {plan.promo_description && (
              <div style={styles.promoText}>{plan.promo_description}</div>
            )}
            {plan.min_purchase_cents > 0 && (
              <div style={styles.minPurchase}>
                Min: {formatCurrency(plan.min_purchase_cents)}
              </div>
            )}
          </div>
        ))}
      </div>

      {calculation && (
        <div style={styles.calculationBox}>
          <h4>Payment Breakdown</h4>
          <div style={styles.calcRow}>
            <span>Purchase Amount:</span>
            <strong>{formatCurrency(calculation.purchaseAmountCents)}</strong>
          </div>
          {calculation.downPaymentCents > 0 && (
            <div style={styles.calcRow}>
              <span>Down Payment:</span>
              <strong>-{formatCurrency(calculation.downPaymentCents)}</strong>
            </div>
          )}
          <div style={styles.calcRow}>
            <span>Amount Financed:</span>
            <strong>{formatCurrency(calculation.financedAmountCents)}</strong>
          </div>
          <div style={styles.calcRow}>
            <span>Monthly Payment:</span>
            <strong style={styles.monthlyPayment}>
              {formatCurrency(calculation.monthlyPaymentCents)}/month
            </strong>
          </div>
          {calculation.totalInterestCents > 0 && (
            <div style={styles.calcRow}>
              <span>Total Interest:</span>
              <strong>{formatCurrency(calculation.totalInterestCents)}</strong>
            </div>
          )}
          <div style={styles.calcRow}>
            <span>Total of Payments:</span>
            <strong>{formatCurrency(calculation.totalPaymentsCents)}</strong>
          </div>

          <div style={styles.downPaymentSection}>
            <label>Down Payment (optional):</label>
            <input
              type="number"
              value={downPayment / 100}
              onChange={(e) => {
                const newDown = Math.round(parseFloat(e.target.value || 0) * 100);
                setDownPayment(newDown);
                if (selectedPlan) calculatePayment(selectedPlan.id);
              }}
              style={styles.input}
              placeholder="0.00"
            />
          </div>

          <button onClick={handleApplyFinancing} style={styles.applyButton}>
            Apply Financing to Quote
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// WARRANTY SELECTOR COMPONENT
// ============================================
export const WarrantySelector = ({ products, onWarrantyAdded }) => {
  const [warrantyPlans, setWarrantyPlans] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [warrantyCost, setWarrantyCost] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (selectedProduct) {
      fetchWarrantyPlans(selectedProduct);
    }
  }, [selectedProduct]);

  const fetchWarrantyPlans = async (product) => {
    setLoading(true);
    try {
      const productPrice = product.price_cents || (product.price * 100);
      const response = await authFetch(
        `${API_BASE}/warranty-plans?productCategory=${product.category || 'appliance'}&productPrice=${productPrice}`
      );
      const data = await response.json();
      setWarrantyPlans(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching warranty plans:', error);
      setLoading(false);
    }
  };

  const calculateWarranty = async (plan, product) => {
    try {
      const productPrice = product.price_cents || (product.price * 100);
      const response = await authFetch(`${API_BASE}/warranty-plans/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.id,
          productPriceCents: productPrice
        })
      });
      const data = await response.json();
      setWarrantyCost(data.warrantyCostCents);
      setSelectedPlan(plan);
    } catch (error) {
      console.error('Error calculating warranty:', error);
    }
  };

  const handleAddWarranty = () => {
    if (selectedPlan && selectedProduct) {
      onWarrantyAdded({
        product: selectedProduct,
        plan: selectedPlan,
        cost: warrantyCost
      });
      // Reset
      setSelectedProduct(null);
      setSelectedPlan(null);
      setWarrantyCost(0);
    }
  };

  const formatCurrency = (cents) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div style={styles.featureContainer}>
      <h3 style={styles.featureTitle}>🛡️ Extended Warranty Protection</h3>

      <div style={styles.productSelector}>
        <label>Select Product to Protect:</label>
        <select
          onChange={(e) => {
            const product = products.find(p => p.id === parseInt(e.target.value));
            setSelectedProduct(product);
          }}
          style={styles.select}
          value={selectedProduct?.id || ''}
        >
          <option value="">Choose a product...</option>
          {products.map(product => (
            <option key={product.id} value={product.id}>
              {product.description || product.sku} - {formatCurrency(product.price_cents || product.price * 100)}
            </option>
          ))}
        </select>
      </div>

      {loading && <div>Loading warranty options...</div>}

      {warrantyPlans.length > 0 && (
        <div style={styles.planGrid}>
          {warrantyPlans.map(plan => (
            <div
              key={plan.id}
              style={{
                ...styles.planCard,
                ...(selectedPlan?.id === plan.id ? styles.selectedPlan : {})
              }}
              onClick={() => calculateWarranty(plan, selectedProduct)}
            >
              <div style={styles.planName}>{plan.plan_name}</div>
              <div style={styles.planDetails}>
                <div style={styles.highlight}>{plan.duration_years} Years</div>
                {plan.warranty_cost_percent > 0 ? (
                  <div>{plan.warranty_cost_percent}% of product price</div>
                ) : (
                  <div>{formatCurrency(plan.warranty_cost_cents)}</div>
                )}
              </div>
              {plan.coverage_details && (
                <div style={styles.coverageDetails}>{plan.coverage_details}</div>
              )}
              {plan.provider && (
                <div style={styles.provider}>By: {plan.provider}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {selectedPlan && warrantyCost > 0 && (
        <div style={styles.calculationBox}>
          <h4>Warranty Summary</h4>
          <div style={styles.calcRow}>
            <span>Plan:</span>
            <strong>{selectedPlan.plan_name}</strong>
          </div>
          <div style={styles.calcRow}>
            <span>Coverage:</span>
            <strong>{selectedPlan.duration_years} Years</strong>
          </div>
          <div style={styles.calcRow}>
            <span>Warranty Cost:</span>
            <strong style={styles.highlight}>{formatCurrency(warrantyCost)}</strong>
          </div>
          <button onClick={handleAddWarranty} style={styles.applyButton}>
            Add Warranty to Quote
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// DELIVERY SELECTOR COMPONENT
// ============================================
export const DeliverySelector = ({ customerAddress, onDeliverySelected }) => {
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [selectedService, setSelectedService] = useState(null);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [timeSlot, setTimeSlot] = useState('morning');
  const [distanceMiles, setDistanceMiles] = useState(10);
  const [floorLevel, setFloorLevel] = useState(1);
  const [isWeekend, setIsWeekend] = useState(false);
  const [isEvening, setIsEvening] = useState(false);
  const [calculation, setCalculation] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDeliveryServices();
  }, []);

  const fetchDeliveryServices = async () => {
    try {
      const response = await authFetch(`${API_BASE}/delivery-services`);
      const data = await response.json();
      setDeliveryServices(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching delivery services:', error);
      setLoading(false);
    }
  };

  const calculateDeliveryCost = async (serviceId) => {
    try {
      const response = await authFetch(`${API_BASE}/delivery-services/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceId: serviceId,
          distanceMiles: parseFloat(distanceMiles),
          floorLevel: parseInt(floorLevel),
          isWeekend: isWeekend,
          isEvening: isEvening
        })
      });
      const data = await response.json();
      setCalculation(data.calculation);
      setSelectedService(data.service);
    } catch (error) {
      console.error('Error calculating delivery cost:', error);
    }
  };

  const handleApplyDelivery = () => {
    if (selectedService && calculation) {
      onDeliverySelected({
        service: selectedService,
        calculation: calculation,
        details: {
          deliveryDate,
          timeSlot,
          distanceMiles,
          floorLevel,
          isWeekend,
          isEvening,
          address: customerAddress
        }
      });
    }
  };

  const formatCurrency = (cents) => `$${(cents / 100).toFixed(2)}`;

  if (loading) return <div>Loading delivery options...</div>;

  return (
    <div style={styles.featureContainer}>
      <h3 style={styles.featureTitle}>🚚 Delivery & Installation</h3>

      <div style={styles.serviceGrid}>
        {deliveryServices.map(service => (
          <div
            key={service.id}
            style={{
              ...styles.serviceCard,
              ...(selectedService?.id === service.id ? styles.selectedPlan : {})
            }}
            onClick={() => calculateDeliveryCost(service.id)}
          >
            <div style={styles.serviceName}>{service.service_name}</div>
            <div style={styles.servicePrice}>
              Starting at {formatCurrency(service.base_price_cents)}
            </div>
            <div style={styles.serviceDesc}>{service.description}</div>
            {service.per_mile_cents > 0 && (
              <div style={styles.serviceDetail}>
                + {formatCurrency(service.per_mile_cents)}/mile
              </div>
            )}
            {service.per_floor_cents > 0 && (
              <div style={styles.serviceDetail}>
                + {formatCurrency(service.per_floor_cents)}/floor above 1st
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={styles.deliveryOptions}>
        <h4>Delivery Details</h4>

        <div style={styles.formRow}>
          <label>Delivery Date:</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            style={styles.input}
            min={new Date().toISOString().split('T')[0]}
          />
        </div>

        <div style={styles.formRow}>
          <label>Time Preference:</label>
          <select value={timeSlot} onChange={(e) => setTimeSlot(e.target.value)} style={styles.select}>
            <option value="morning">Morning (8AM-12PM)</option>
            <option value="afternoon">Afternoon (12PM-5PM)</option>
            <option value="evening">Evening (5PM-8PM)</option>
          </select>
        </div>

        <div style={styles.formRow}>
          <label>Distance (miles):</label>
          <input
            type="number"
            value={distanceMiles}
            onChange={(e) => {
              setDistanceMiles(e.target.value);
              if (selectedService) calculateDeliveryCost(selectedService.id);
            }}
            style={styles.input}
            min="0"
            step="0.1"
          />
        </div>

        <div style={styles.formRow}>
          <label>Floor Level:</label>
          <select
            value={floorLevel}
            onChange={(e) => {
              setFloorLevel(e.target.value);
              if (selectedService) calculateDeliveryCost(selectedService.id);
            }}
            style={styles.select}
          >
            {[1, 2, 3, 4, 5].map(floor => (
              <option key={floor} value={floor}>Floor {floor}</option>
            ))}
          </select>
        </div>

        <div style={styles.checkboxRow}>
          <label>
            <input
              type="checkbox"
              checked={isWeekend}
              onChange={(e) => {
                setIsWeekend(e.target.checked);
                if (selectedService) calculateDeliveryCost(selectedService.id);
              }}
            />
            Weekend Delivery (+premium)
          </label>
        </div>

        <div style={styles.checkboxRow}>
          <label>
            <input
              type="checkbox"
              checked={isEvening}
              onChange={(e) => {
                setIsEvening(e.target.checked);
                if (selectedService) calculateDeliveryCost(selectedService.id);
              }}
            />
            Evening Delivery (+premium)
          </label>
        </div>
      </div>

      {calculation && (
        <div style={styles.calculationBox}>
          <h4>Delivery Cost Breakdown</h4>
          <div style={styles.calcRow}>
            <span>Base Price:</span>
            <strong>{formatCurrency(calculation.basePrice)}</strong>
          </div>
          {calculation.distanceCharge > 0 && (
            <div style={styles.calcRow}>
              <span>Distance Charge:</span>
              <strong>+{formatCurrency(calculation.distanceCharge)}</strong>
            </div>
          )}
          {calculation.floorCharge > 0 && (
            <div style={styles.calcRow}>
              <span>Floor Charge:</span>
              <strong>+{formatCurrency(calculation.floorCharge)}</strong>
            </div>
          )}
          {calculation.weekendPremium > 0 && (
            <div style={styles.calcRow}>
              <span>Weekend Premium:</span>
              <strong>+{formatCurrency(calculation.weekendPremium)}</strong>
            </div>
          )}
          {calculation.eveningPremium > 0 && (
            <div style={styles.calcRow}>
              <span>Evening Premium:</span>
              <strong>+{formatCurrency(calculation.eveningPremium)}</strong>
            </div>
          )}
          <div style={{...styles.calcRow, ...styles.totalRow}}>
            <span>TOTAL DELIVERY COST:</span>
            <strong style={styles.totalAmount}>{formatCurrency(calculation.totalCents)}</strong>
          </div>
          <button onClick={handleApplyDelivery} style={styles.applyButton}>
            Add Delivery to Quote
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// REBATES DISPLAY COMPONENT
// ============================================
export const RebatesDisplay = ({ products, onRebateApplied }) => {
  const [rebates, setRebates] = useState([]);
  const [selectedRebates, setSelectedRebates] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActiveRebates();
  }, []);

  const fetchActiveRebates = async () => {
    try {
      const response = await authFetch(`${API_BASE}/rebates`);
      const data = await response.json();
      setRebates(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching rebates:', error);
      setLoading(false);
    }
  };

  const toggleRebate = (rebate) => {
    const isSelected = selectedRebates.find(r => r.id === rebate.id);
    if (isSelected) {
      setSelectedRebates(selectedRebates.filter(r => r.id !== rebate.id));
    } else {
      setSelectedRebates([...selectedRebates, rebate]);
    }
  };

  const handleApplyRebates = () => {
    onRebateApplied(selectedRebates);
  };

  const formatCurrency = (cents) => `$${(cents / 100).toFixed(2)}`;
  const formatDate = (dateStr) => new Date(dateStr).toLocaleDateString();

  if (loading) return <div>Loading rebates...</div>;

  if (rebates.length === 0) {
    return (
      <div style={styles.featureContainer}>
        <h3 style={styles.featureTitle}>💰 Manufacturer Rebates</h3>
        <div style={styles.noRebates}>No active rebates at this time</div>
      </div>
    );
  }

  return (
    <div style={styles.featureContainer}>
      <h3 style={styles.featureTitle}>💰 Active Manufacturer Rebates</h3>

      <div style={styles.rebateGrid}>
        {rebates.map(rebate => {
          const isSelected = selectedRebates.find(r => r.id === rebate.id);
          return (
            <div
              key={rebate.id}
              style={{
                ...styles.rebateCard,
                ...(isSelected ? styles.selectedRebate : {})
              }}
              onClick={() => toggleRebate(rebate)}
            >
              <div style={styles.rebateHeader}>
                <div style={styles.manufacturer}>{rebate.manufacturer}</div>
                <div style={styles.rebateAmount}>
                  {rebate.rebate_percent
                    ? `${rebate.rebate_percent}% OFF`
                    : formatCurrency(rebate.rebate_amount_cents)
                  }
                </div>
              </div>
              <div style={styles.rebateName}>{rebate.rebate_name}</div>
              <div style={styles.rebateType}>
                {rebate.rebate_type === 'instant' ? '⚡ Instant Rebate' : '📮 Mail-In Rebate'}
              </div>
              <div style={styles.rebateDates}>
                Valid: {formatDate(rebate.start_date)} - {formatDate(rebate.end_date)}
              </div>
              {rebate.min_purchase_amount_cents > 0 && (
                <div style={styles.minPurchase}>
                  Min Purchase: {formatCurrency(rebate.min_purchase_amount_cents)}
                </div>
              )}
              {isSelected && (
                <div style={styles.selectedBadge}>✓ Selected</div>
              )}
            </div>
          );
        })}
      </div>

      {selectedRebates.length > 0 && (
        <div style={styles.calculationBox}>
          <h4>Selected Rebates</h4>
          {selectedRebates.map(rebate => (
            <div key={rebate.id} style={styles.calcRow}>
              <span>{rebate.rebate_name}:</span>
              <strong>
                {rebate.rebate_percent
                  ? `${rebate.rebate_percent}% OFF`
                  : `-${formatCurrency(rebate.rebate_amount_cents)}`
                }
              </strong>
            </div>
          ))}
          <button onClick={handleApplyRebates} style={styles.applyButton}>
            Apply Rebates to Quote
          </button>
        </div>
      )}
    </div>
  );
};

// ============================================
// TRADE-IN ESTIMATOR COMPONENT
// ============================================
export const TradeInEstimator = ({ onTradeInAdded }) => {
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [modelNumber, setModelNumber] = useState('');
  const [ageYears, setAgeYears] = useState(0);
  const [condition, setCondition] = useState('good');
  const [notes, setNotes] = useState('');
  const [estimatedValue, setEstimatedValue] = useState(0);
  const [tradeInValues, setTradeInValues] = useState([]);

  const categories = ['refrigerator', 'tv', 'washer', 'dryer', 'dishwasher', 'range', 'microwave'];
  const conditions = [
    { value: 'excellent', label: 'Excellent - Like new, no defects' },
    { value: 'good', label: 'Good - Minor wear, fully functional' },
    { value: 'fair', label: 'Fair - Visible wear, works well' },
    { value: 'poor', label: 'Poor - Heavy wear, some issues' }
  ];

  useEffect(() => {
    if (category && condition) {
      fetchTradeInValue();
    }
  }, [category, condition, ageYears]);

  const fetchTradeInValue = async () => {
    try {
      const params = new URLSearchParams({
        productCategory: category,
        condition: condition,
        ageYears: ageYears
      });
      const response = await authFetch(`${API_BASE}/trade-in-values?${params}`);
      const data = await response.json();
      setTradeInValues(data);
      if (data.length > 0) {
        setEstimatedValue(data[0].estimated_value_cents);
      }
    } catch (error) {
      console.error('Error fetching trade-in values:', error);
    }
  };

  const handleAddTradeIn = () => {
    if (category && estimatedValue > 0) {
      onTradeInAdded({
        productCategory: category,
        brand: brand,
        modelNumber: modelNumber,
        ageYears: parseInt(ageYears),
        condition: condition,
        estimatedValueCents: estimatedValue,
        notes: notes
      });
      // Reset form
      setCategory('');
      setBrand('');
      setModelNumber('');
      setAgeYears(0);
      setCondition('good');
      setNotes('');
      setEstimatedValue(0);
    }
  };

  const formatCurrency = (cents) => `$${(cents / 100).toFixed(2)}`;

  return (
    <div style={styles.featureContainer}>
      <h3 style={styles.featureTitle}>🔄 Trade-In Value Estimator</h3>

      <div style={styles.tradeInForm}>
        <div style={styles.formRow}>
          <label>Product Category:</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={styles.select}
          >
            <option value="">Select category...</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat.charAt(0).toUpperCase() + cat.slice(1)}</option>
            ))}
          </select>
        </div>

        <div style={styles.formRow}>
          <label>Brand:</label>
          <input
            type="text"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            style={styles.input}
            placeholder="Samsung, LG, Whirlpool, etc."
          />
        </div>

        <div style={styles.formRow}>
          <label>Model Number:</label>
          <input
            type="text"
            value={modelNumber}
            onChange={(e) => setModelNumber(e.target.value)}
            style={styles.input}
            placeholder="RF28R7201SR"
          />
        </div>

        <div style={styles.formRow}>
          <label>Age:</label>
          <select
            value={ageYears}
            onChange={(e) => setAgeYears(e.target.value)}
            style={styles.select}
          >
            <option value="0">Brand New / Less than 1 year</option>
            <option value="1">1-2 years</option>
            <option value="3">3-5 years</option>
            <option value="6">6-10 years</option>
            <option value="10">Over 10 years</option>
          </select>
        </div>

        <div style={styles.formRow}>
          <label>Condition:</label>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value)}
            style={styles.select}
          >
            {conditions.map(cond => (
              <option key={cond.value} value={cond.value}>{cond.label}</option>
            ))}
          </select>
        </div>

        <div style={styles.formRow}>
          <label>Notes:</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={styles.textarea}
            placeholder="Working condition, scratches on door, etc."
            rows="3"
          />
        </div>
      </div>

      {estimatedValue > 0 && (
        <div style={styles.estimateBox}>
          <h4>Estimated Trade-In Value</h4>
          <div style={styles.estimateValue}>{formatCurrency(estimatedValue)}</div>
          <div style={styles.estimateNote}>
            This is an estimate. Final value determined upon inspection.
          </div>
          <button onClick={handleAddTradeIn} style={styles.applyButton}>
            Apply Trade-In to Quote
          </button>
        </div>
      )}

      {tradeInValues.length > 1 && (
        <div style={styles.alternativeValues}>
          <h5>Alternative Valuations:</h5>
          {tradeInValues.slice(1).map((val, idx) => (
            <div key={idx} style={styles.altValue} onClick={() => setEstimatedValue(val.estimated_value_cents)}>
              {val.condition} condition: {formatCurrency(val.estimated_value_cents)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// STYLES
// ============================================
const styles = {
  featureContainer: {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
  },
  featureTitle: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    color: '#333',
    borderBottom: '2px solid #4CAF50',
    paddingBottom: '10px'
  },
  planGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  planCard: {
    padding: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fafafa'
  },
  selectedPlan: {
    border: '2px solid #4CAF50',
    backgroundColor: '#e8f5e9',
    boxShadow: '0 4px 8px rgba(76, 175, 80, 0.2)'
  },
  planName: {
    fontWeight: 'bold',
    marginBottom: '8px',
    fontSize: '14px'
  },
  planDetails: {
    fontSize: '13px',
    color: '#666'
  },
  planTerm: {
    fontSize: '12px',
    color: '#999',
    marginTop: '4px'
  },
  highlight: {
    color: '#4CAF50',
    fontWeight: 'bold',
    fontSize: '16px'
  },
  promoText: {
    fontSize: '11px',
    color: '#FF9800',
    marginTop: '8px',
    fontStyle: 'italic'
  },
  minPurchase: {
    fontSize: '11px',
    color: '#666',
    marginTop: '4px'
  },
  calculationBox: {
    backgroundColor: '#f5f5f5',
    padding: '20px',
    borderRadius: '8px',
    marginTop: '20px'
  },
  calcRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    borderBottom: '1px solid #e0e0e0'
  },
  monthlyPayment: {
    fontSize: '18px',
    color: '#4CAF50'
  },
  downPaymentSection: {
    marginTop: '15px',
    padding: '10px',
    backgroundColor: '#fff',
    borderRadius: '4px'
  },
  input: {
    width: '100%',
    padding: '8px',
    marginTop: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px'
  },
  select: {
    width: '100%',
    padding: '8px',
    marginTop: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px'
  },
  applyButton: {
    width: '100%',
    padding: '12px',
    marginTop: '15px',
    backgroundColor: '#4CAF50',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer'
  },
  warningBox: {
    backgroundColor: '#fff3cd',
    padding: '10px',
    borderRadius: '4px',
    marginBottom: '15px',
    border: '1px solid #ffc107',
    color: '#856404'
  },
  productSelector: {
    marginBottom: '20px'
  },
  coverageDetails: {
    fontSize: '12px',
    color: '#666',
    marginTop: '8px',
    lineHeight: '1.4'
  },
  provider: {
    fontSize: '11px',
    color: '#999',
    marginTop: '4px'
  },
  serviceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  serviceCard: {
    padding: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fafafa'
  },
  serviceName: {
    fontWeight: 'bold',
    marginBottom: '5px',
    fontSize: '14px'
  },
  servicePrice: {
    color: '#4CAF50',
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px'
  },
  serviceDesc: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '8px'
  },
  serviceDetail: {
    fontSize: '11px',
    color: '#999',
    marginTop: '4px'
  },
  deliveryOptions: {
    backgroundColor: '#f9f9f9',
    padding: '20px',
    borderRadius: '8px',
    marginTop: '20px'
  },
  formRow: {
    marginBottom: '15px'
  },
  checkboxRow: {
    marginBottom: '10px'
  },
  totalRow: {
    borderTop: '2px solid #333',
    marginTop: '10px',
    paddingTop: '10px',
    fontWeight: 'bold'
  },
  totalAmount: {
    fontSize: '20px',
    color: '#4CAF50'
  },
  rebateGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '15px',
    marginBottom: '20px'
  },
  rebateCard: {
    padding: '15px',
    border: '2px solid #e0e0e0',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fafafa',
    position: 'relative'
  },
  selectedRebate: {
    border: '2px solid #FF9800',
    backgroundColor: '#fff3e0',
    boxShadow: '0 4px 8px rgba(255, 152, 0, 0.2)'
  },
  rebateHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px'
  },
  manufacturer: {
    fontWeight: 'bold',
    fontSize: '14px',
    color: '#333'
  },
  rebateAmount: {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#FF9800'
  },
  rebateName: {
    fontSize: '13px',
    marginBottom: '8px',
    color: '#666'
  },
  rebateType: {
    fontSize: '12px',
    color: '#4CAF50',
    marginBottom: '5px'
  },
  rebateDates: {
    fontSize: '11px',
    color: '#999'
  },
  selectedBadge: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    backgroundColor: '#FF9800',
    color: 'white',
    padding: '4px 8px',
    borderRadius: '12px',
    fontSize: '11px',
    fontWeight: 'bold'
  },
  noRebates: {
    textAlign: 'center',
    padding: '40px',
    color: '#999'
  },
  tradeInForm: {
    backgroundColor: '#f9f9f9',
    padding: '20px',
    borderRadius: '8px',
    marginBottom: '20px'
  },
  textarea: {
    width: '100%',
    padding: '8px',
    marginTop: '5px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '14px',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  estimateBox: {
    backgroundColor: '#e8f5e9',
    padding: '20px',
    borderRadius: '8px',
    textAlign: 'center'
  },
  estimateValue: {
    fontSize: '36px',
    fontWeight: 'bold',
    color: '#4CAF50',
    margin: '15px 0'
  },
  estimateNote: {
    fontSize: '12px',
    color: '#666',
    marginBottom: '15px'
  },
  alternativeValues: {
    marginTop: '15px',
    padding: '15px',
    backgroundColor: '#f5f5f5',
    borderRadius: '8px'
  },
  altValue: {
    padding: '8px',
    marginBottom: '5px',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s'
  }
};

export default {
  FinancingCalculator,
  WarrantySelector,
  DeliverySelector,
  RebatesDisplay,
  TradeInEstimator
};
