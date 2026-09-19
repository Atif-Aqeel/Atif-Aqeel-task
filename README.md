# Made-to-Measure Curtain configurator

This Shopify OS 2.0 theme is based on Dawn. The custom product page is implemented in `sections/curtain-configurator.liquid`, `templates/product.curtain.json`, and the matching CSS and JavaScript assets.

## Preview and setup

1. Install Node.js and Shopify CLI, then log in to a Shopify development store with `shopify auth login`.
2. From this theme directory, run `shopify theme dev --store dev-store-startup.myshopify.com` (replace the domain for another store).
3. Open `/products/made-to-measure-curtain?view=curtain` on the CLI preview URL. The `view=curtain` query selects the alternate product template while previewing an unpublished theme. Keep that query on the reviewer link.

The unpublished reviewer theme is `comfy-symmetry` (theme ID `188296560944`). Its [curtain preview](https://dev-store-startup.myshopify.com/products/made-to-measure-curtain?preview_theme_id=188296560944&view=curtain) requires the development store's storefront password, which should be shared separately from the repository.

The store must contain an active product with variants using the option names `Width range` and `Drop`. The width option values must describe the same inclusive ranges as the tiers: `50–120 cm`, `121–240 cm`, and `241–360 cm`. The drop values are `150 cm`, `200 cm`, and `250 cm`. This creates nine variants. The option names are editable in the custom section settings.

In Shopify Admin, create a metaobject definition named **Curtain Pricing Tier** (`curtain_pricing_tier`). Add single-value integer fields `min_width`, `max_width`, and `panels_required`, plus single-value decimal fields `base_price` and `price_per_drop_tier`. Save three active entries using the table below. Create a product metafield definition `custom.curtain_pricing_tiers` as a **list of references** to Curtain Pricing Tier, then attach all three entries to the curtain product. Set the product to Active and publish it to Online Store.

| Width (cm) | Panels | Base price (USD) | Per drop step (USD) | 150 cm | 200 cm | 250 cm |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 50–120 | 1 | 100 | 25 | 100 | 125 | 150 |
| 121–240 | 2 | 200 | 50 | 200 | 250 | 300 |
| 241–360 | 3 | 300 | 75 | 300 | 375 | 450 |

Set each variant's Shopify price to the corresponding amount in the table. The storefront refuses to add a combination when its calculated price differs from its actual variant price.

## Pricing and cart behavior

The task does not define a formula for `price_per_drop_tier`, so this implementation treats it as the increment for each drop preset after 150 cm:

`price = base_price + drop_step × price_per_drop_tier`, where 150 cm is step 0, 200 cm is step 1, and 250 cm is step 2.

The browser reads the product's referenced metaobjects rendered by Liquid, finds the unique tier for the entered whole-number width, finds its matching width-range/drop variant, and updates the displayed price without a page reload. The selected variant carries the actual checkout price; a line-item property cannot change that price. A price mismatch disables Add to cart to prevent a misleading storefront price. To support prices that vary for every individual centimeter, the project would require a different variant strategy or a server-side Shopify Function/app implementation.

Add to cart sends one JSON request to `/cart/add.js` with the selected variant ID, quantity 1, and line-item properties. For example, a 121 × 200 cm Slate curtain sends:

```json
{
  "id": "<Shopify variant ID for 121–240 cm / 200 cm>",
  "quantity": 1,
  "properties": {
    "Width": "121 cm",
    "Drop": "200 cm",
    "Fabric": "Slate",
    "_fabric_panels": "2"
  }
}
```

The actual request also includes Dawn's `sections` and `sections_url` parameters so the returned cart notification HTML can be rendered without a page reload. `_fabric_panels` carries the tier's panel count as a private line-item property for fulfillment; Dawn's cart notification, drawer, and cart page display the public properties and hide the private one. If cart section rendering fails after Shopify accepts the item, the storefront opens the cart page instead of presenting a false Add to cart error.

Fabric swatches are editable section blocks. The section uses a native custom element, Liquid, and theme assets; it adds no JavaScript package dependency. The width is limited to 50–360 cm by the tier data and input validation. Missing or overlapping tiers, unavailable variants, and mismatched prices produce an error and disable Add to cart.

## Checks

Run `node --check assets/curtain-configurator.js`, `node tests/curtain-configurator.test.cjs`, and `shopify theme check` from this directory. Theme Check has no errors; warnings remain in unrelated imported theme files and legacy app snippets.

In the preview, test widths 50, 120, 121, 240, 241, and 360 cm with each drop option. Check widths outside 50–360, fractional widths, fabric selection, and Add to cart. Confirm the cart shows the charged variant price and public measurement properties. The private panel property should be present in the Ajax cart data and hidden from the storefront cart display. Check mobile and desktop layout, keyboard access, and that price changes do not move surrounding content.

The [Metaobject definition screenshot](docs/curtain-pricing-tier-definition.png) shows the five field names and types, and the [pricing entries screenshot](docs/curtain-pricing-tier-entries.png) shows the three configured rules. The accompanying [schema record](docs/curtain-pricing-tier-schema.json) documents the definition, product metafield reference, and values in a reviewable text format. It was checked against the live product data; it is not a Shopify API export.
