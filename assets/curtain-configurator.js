if (!customElements.get('curtain-configurator')) {
  customElements.define(
    'curtain-configurator',
    class CurtainConfigurator extends HTMLElement {
      connectedCallback() {
        this.widthInput = this.querySelector('[data-curtain-width]');
        this.dropInput = this.querySelector('[data-curtain-drop]');
        this.priceOutput = this.querySelector('[data-curtain-price]');
        this.errorOutput = this.querySelector('[data-curtain-error]');
        this.addButton = this.querySelector('[data-curtain-add]');
        this.addLabel = this.querySelector('[data-curtain-add-label]');
        this.cart = document.querySelector('cart-notification') || document.querySelector('cart-drawer');
        this.isSubmitting = false;

        try {
          this.tiers = [...this.querySelectorAll('[data-curtain-tier]')].map((element) => ({
            min: Number(element.dataset.minWidth),
            max: Number(element.dataset.maxWidth),
            panels: Number(element.dataset.panels),
            basePrice: Number(element.dataset.basePrice),
            pricePerDropTier: Number(element.dataset.pricePerDropTier),
          }));
          this.variants = JSON.parse(this.querySelector('[data-curtain-variants]').textContent);
          this.optionNames = JSON.parse(this.querySelector('[data-curtain-options]').textContent);
          this.widthOptionIndex = this.optionNames.indexOf(this.dataset.widthOptionName);
          this.dropOptionIndex = this.optionNames.indexOf(this.dataset.dropOptionName);
          this.moneyFormatter = new Intl.NumberFormat(document.documentElement.lang || 'en', {
            style: 'currency',
            currency: this.dataset.currency,
          });
        } catch (error) {
          this.showError('Product configuration could not be loaded. Please try again later.');
          return;
        }

        this.widthInput.addEventListener('input', () => this.update());
        this.dropInput.addEventListener('change', () => this.update());
        this.querySelectorAll('[data-curtain-fabric]').forEach((input) => {
          input.addEventListener('change', () => this.update());
        });
        this.addButton.addEventListener('click', () => this.addToCart());
        this.update();
      }

      getSelectedFabric() {
        return this.querySelector('[data-curtain-fabric]:checked')?.value || '';
      }

      getWidthRange(optionValue) {
        const numbers = String(optionValue).match(/\d+/g);
        return numbers?.length === 2 ? numbers.map(Number) : null;
      }

      getSelection() {
        const width = Number(this.widthInput.value);
        const drop = Number(this.dropInput.value);
        const dropStep = this.dropInput.selectedIndex;
        const fabric = this.getSelectedFabric();

        if (!this.widthInput.value || !Number.isInteger(width) || !this.widthInput.validity.valid) {
          throw new Error(`Enter a whole-number width from ${this.widthInput.min} to ${this.widthInput.max} cm.`);
        }
        if (!this.dropInput.value || dropStep < 0 || !Number.isInteger(drop)) {
          throw new Error('Select a valid drop.');
        }
        if (!fabric) {
          throw new Error('Select a fabric colour.');
        }
        if (this.widthOptionIndex < 0 || this.dropOptionIndex < 0) {
          throw new Error('Product variant options are not configured correctly.');
        }

        const matchingTiers = this.tiers.filter((tier) => width >= tier.min && width <= tier.max);
        if (matchingTiers.length !== 1) {
          throw new Error('No unique pricing tier is available for this width.');
        }
        const tier = matchingTiers[0];
        if (
          !Number.isInteger(tier.panels) ||
          tier.panels < 1 ||
          !Number.isFinite(tier.basePrice) ||
          !Number.isFinite(tier.pricePerDropTier)
        ) {
          throw new Error('Pricing data is incomplete.');
        }

        const expectedPriceCents = Math.round((tier.basePrice + dropStep * tier.pricePerDropTier) * 100);
        const matchingVariants = this.variants.filter((candidate) => {
          const range = this.getWidthRange(candidate.options[this.widthOptionIndex]);
          const variantDrop = Number.parseInt(candidate.options[this.dropOptionIndex], 10);
          return range && range[0] === tier.min && range[1] === tier.max && variantDrop === drop;
        });

        if (matchingVariants.length !== 1) {
          throw new Error('This width and drop combination is unavailable.');
        }
        const variant = matchingVariants[0];
        if (!variant.available) {
          throw new Error('This width and drop combination is sold out.');
        }
        if (Number(variant.price) !== expectedPriceCents) {
          throw new Error('This combination has a pricing mismatch. Please contact the store.');
        }

        return { width, drop, fabric, tier, variant, priceCents: expectedPriceCents };
      }

      showError(message) {
        this.selection = null;
        this.errorOutput.textContent = message;
        this.priceOutput.textContent = 'Price unavailable';
        this.addLabel.textContent = 'Add to cart';
        this.addButton.disabled = true;
      }

      update() {
        try {
          this.selection = this.getSelection();
          this.errorOutput.textContent = '';
          this.priceOutput.textContent = this.moneyFormatter.format(this.selection.priceCents / 100);
          this.addLabel.textContent = `Add to cart — ${this.priceOutput.textContent}`;
          this.addButton.disabled = this.isSubmitting;
        } catch (error) {
          this.showError(error.message);
        }
      }

      async addToCart() {
        if (this.isSubmitting || !this.selection) return;

        this.isSubmitting = true;
        this.addButton.disabled = true;
        this.addLabel.textContent = 'Adding…';
        const selection = this.selection;
        const sections = this.cart?.getSectionsToRender().map((section) => section.id);
        this.cart?.setActiveElement(document.activeElement);

        try {
          const response = await fetch(window.routes?.cart_add_url || '/cart/add.js', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
              id: selection.variant.id,
              quantity: 1,
              properties: {
                Width: `${selection.width} cm`,
                Drop: `${selection.drop} cm`,
                Fabric: selection.fabric,
                _fabric_panels: String(selection.tier.panels),
              },
              ...(sections ? { sections, sections_url: window.location.pathname } : {}),
            }),
          });
          const result = await response.json();
          if (!response.ok || result.status) {
            throw new Error(result.description || result.message || 'Could not add this curtain to the cart.');
          }

          if (this.cart && result.sections && sections.every((id) => result.sections[id])) {
            try {
              this.cart.renderContents(result);
            } catch (error) {
              window.location.assign(window.routes?.cart_url || '/cart');
            }
          } else {
            window.location.assign(window.routes?.cart_url || '/cart');
          }
        } catch (error) {
          this.errorOutput.textContent = error.message;
        } finally {
          this.isSubmitting = false;
          if (this.selection) {
            this.addButton.disabled = false;
            this.addLabel.textContent = `Add to cart — ${this.priceOutput.textContent}`;
          } else {
            this.update();
          }
        }
      }
    }
  );
}
