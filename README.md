# Made-to-Measure Curtain configurator

This Shopify OS 2.0 theme is based on Dawn. The custom product page is implemented in `sections/curtain-configurator.liquid`, `templates/product.curtain.json`, and the matching CSS and JavaScript assets.

## Preview and setup

1. Install Node.js and Shopify CLI, then log in to a Shopify development store with `shopify auth login`.
2. From this theme directory, run `shopify theme dev --store dev-store-startup.myshopify.com` (replace the domain for another store).
3. Open `/products/made-to-measure-curtain?view=curtain` on the CLI preview URL. For a published theme, assign the `curtain` product template to the product in Shopify Admin.

The store must contain an active product with variants using the option names `Width range` and `Drop`. The width option values must describe the same inclusive ranges as the tiers: `50–120 cm`, `121–240 cm`, and `241–360 cm`. The drop values are `150 cm`, `200 cm`, and `250 cm`. This creates nine variants. The option names are editable in the custom section settings.

Create a metaobject definition `curtain_pricing_tier` with integer fields `min_width`, `max_width`, `panels_required` and decimal fields `base_price`, `price_per_drop_tier`. Create a product metafield `custom.curtain_pricing_tiers` as a **list of metaobject references** to that definition, and attach all three entries to the product.

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

Add to cart uses `/cart/add.js` with the selected variant and `Width`, `Drop`, and `Fabric` line-item properties. `_fabric_panels` carries the tier's panel count as a private line-item property. Dawn's cart notification, drawer, and cart page already render the public properties and hide the private one.

Fabric swatches are editable section blocks. The section uses a native custom element, Liquid, and theme assets; it adds no JavaScript package dependency. The width is limited to 50–360 cm by the tier data and input validation. Missing or overlapping tiers, unavailable variants, and mismatched prices produce an error and disable Add to cart.

## Checks

Run `node --check assets/curtain-configurator.js` and `shopify theme check` from this directory. In the preview, test 50, 120, 121, 240, 241, and 360 cm; each drop option; invalid widths; and Add to cart. Confirm the cart shows the selected variant and public measurement properties.
