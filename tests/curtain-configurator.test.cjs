const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const variants = [
  [50, 120, 10000, 12500, 15000],
  [121, 240, 20000, 25000, 30000],
  [241, 360, 30000, 37500, 45000],
].flatMap(([min, max, ...prices]) =>
  prices.map((price, index) => ({
    id: `${min}-${index}`,
    options: [`${min}–${max} cm`, `${[150, 200, 250][index]} cm`],
    price,
    available: true,
  }))
);

function makeConfigurator() {
  let Constructor;
  const context = {
    HTMLElement: class {},
    customElements: {
      get: () => undefined,
      define: (_, component) => { Constructor = component; },
    },
    document: { activeElement: {} },
    window: { routes: { cart_add_url: '/cart/add.js', cart_url: '/cart' }, location: { pathname: '/products/made-to-measure-curtain' } },
    fetch: undefined,
    Intl,
  };
  const source = fs.readFileSync(path.join(__dirname, '../assets/curtain-configurator.js'), 'utf8');
  vm.runInNewContext(source, context);

  const element = new Constructor();
  element.tiers = [
    { min: 50, max: 120, panels: 1, basePrice: 100, pricePerDropTier: 25 },
    { min: 121, max: 240, panels: 2, basePrice: 200, pricePerDropTier: 50 },
    { min: 241, max: 360, panels: 3, basePrice: 300, pricePerDropTier: 75 },
  ];
  element.variants = variants.map((variant) => ({ ...variant, options: [...variant.options] }));
  element.widthOptionIndex = 0;
  element.dropOptionIndex = 1;
  element.widthInput = { value: '50', min: '50', max: '360', validity: { valid: true } };
  element.dropInput = { value: '150', selectedIndex: 0 };
  element.getSelectedFabric = () => 'Ivory';
  element.moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
  element.priceOutput = { textContent: '' };
  element.errorOutput = { textContent: '' };
  element.addButton = { disabled: true };
  element.addLabel = { textContent: '' };
  element.isSubmitting = false;
  return { element, context };
}

test('tier boundaries and all drop prices select the charged variant', () => {
  const { element } = makeConfigurator();
  for (const width of [50, 120, 121, 240, 241, 360]) {
    for (const [index, drop] of [150, 200, 250].entries()) {
      element.widthInput.value = String(width);
      element.dropInput.value = String(drop);
      element.dropInput.selectedIndex = index;
      const selection = element.getSelection();
      assert.equal(selection.variant.price, selection.priceCents);
      assert.equal(selection.tier.panels, width <= 120 ? 1 : width <= 240 ? 2 : 3);
    }
  }
});

test('invalid data and a price mismatch disable Add to cart', () => {
  const cases = [
    (element) => { element.widthInput.value = '49'; element.widthInput.validity.valid = false; },
    (element) => { element.widthInput.value = '361'; element.widthInput.validity.valid = false; },
    (element) => { element.widthInput.value = '120.5'; element.widthInput.validity.valid = false; },
    (element) => { element.tiers = []; },
    (element) => { element.tiers.push({ ...element.tiers[0] }); },
    (element) => { element.variants[0].available = false; },
    (element) => { element.variants[0].price = 1000; },
    (element) => { element.getSelectedFabric = () => ''; },
  ];
  for (const change of cases) {
    const { element } = makeConfigurator();
    change(element);
    element.update();
    assert.equal(element.addButton.disabled, true);
    assert.equal(element.selection, null);
    assert.ok(element.errorOutput.textContent);
  }
});

test('cart request serializes the selected variant and private panel count once', async () => {
  const { element, context } = makeConfigurator();
  element.widthInput.value = '121';
  element.dropInput.value = '200';
  element.dropInput.selectedIndex = 1;
  element.getSelectedFabric = () => 'Slate';
  element.update();

  let requests = 0;
  let finishRequest;
  context.fetch = async (_, config) => {
    requests += 1;
    const body = JSON.parse(config.body);
    assert.equal(body.id, '121-1');
    assert.deepEqual(JSON.parse(JSON.stringify(body.properties)), {
      Width: '121 cm', Drop: '200 cm', Fabric: 'Slate', _fabric_panels: '2',
    });
    assert.deepEqual(JSON.parse(JSON.stringify(body.sections)), ['cart-notification-product']);
    await new Promise((resolve) => { finishRequest = resolve; });
    return { ok: true, json: async () => ({ sections: { 'cart-notification-product': '<div></div>' } }) };
  };
  let rendered = false;
  element.cart = {
    getSectionsToRender: () => [{ id: 'cart-notification-product' }],
    setActiveElement: () => {},
    renderContents: () => { rendered = true; },
  };
  const first = element.addToCart();
  await element.addToCart();
  assert.equal(requests, 1);
  assert.equal(element.addButton.disabled, true);
  finishRequest();
  await first;
  assert.equal(rendered, true);
  assert.equal(element.addButton.disabled, false);
});

test('cart API error remains visible and allows retry', async () => {
  const { element, context } = makeConfigurator();
  element.update();
  context.fetch = async () => ({ ok: false, json: async () => ({ description: 'Cart unavailable' }) });
  await element.addToCart();
  assert.equal(element.errorOutput.textContent, 'Cart unavailable');
  assert.equal(element.addButton.disabled, false);
});

test('a cart rendering failure opens the cart after a successful add', async () => {
  const { element, context } = makeConfigurator();
  element.update();
  context.fetch = async () => ({
    ok: true,
    json: async () => ({ sections: { 'cart-notification-product': '<div></div>' } }),
  });
  let destination;
  context.window.location.assign = (url) => { destination = url; };
  element.cart = {
    getSectionsToRender: () => [{ id: 'cart-notification-product' }],
    setActiveElement: () => {},
    renderContents: () => { throw new Error('Cart markup could not render'); },
  };
  await element.addToCart();
  assert.equal(destination, '/cart');
  assert.equal(element.errorOutput.textContent, '');
});
