# Digital Commerce Setup (Developers and Admins)

Developer-side setup for Xperience's digital commerce features — product catalog modeling, pricing, checkout process, order management, promotions, and payment/shipping configuration.

## Documentation pages

| Page | Path | What it covers |
|---|---|---|
| **Digital commerce setup** (index) | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup.md` | Overview of the commerce module; architecture decisions |
| Commerce architecture | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/commerce-architecture.md` | High-level architecture: how commerce integrates with content types, channels, and the live site |
| Commerce config | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/commerce-config.md` | Core commerce configuration settings |

### Product catalog

| Page | Path | What it covers |
|---|---|---|
| Model product catalog | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/model-product-catalog.md` | Modeling products using content types; product page patterns |
| → Example product catalog | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/model-product-catalog/example-product-catalog.md` | End-to-end example of a product catalog setup |
| → Model product stock | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/model-product-catalog/model-product-stock.md` | Stock/inventory management patterns |

### Pricing

| Page | Path | What it covers |
|---|---|---|
| Price calculation | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/price-calculation.md` | Price calculation pipeline overview |
| → Implementation | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/price-calculation/implementation.md` | Implementing custom price calculators |
| → Customization | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/price-calculation/customization.md` | Extending the default pricing logic |

### Checkout & orders

| Page | Path | What it covers |
|---|---|---|
| Checkout process | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/checkout-process.md` | Implementing the checkout flow |
| → Order creation | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/checkout-process/order-creation.md` | How orders are created from the shopping cart |
| → Customize order creation | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/checkout-process/customize-order-creation.md` | Extending the order creation process |
| Configure order statuses | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/configure-order-statuses.md` | Defining order status workflow |

### Promotions & payment

| Page | Path | What it covers |
|---|---|---|
| Promotions | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/promotions.md` | Discount and promotion system |
| → (subfolder) | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/promotions/` | Detailed promotion topics |
| Shipping and payment methods | `./src/_documentation/_documentation/developers-and-admins/digital-commerce-setup/shipping-and-payment-methods.md` | Configuring shipping carriers and payment gateways |

## Key concepts

- Commerce uses **content types** for product modeling — products are content items with pricing fields, not separate commerce entities. This is a key architectural decision.
- **Price calculation** is a pipeline with extensible calculators. Developers implement `IPriceCalculator` for custom pricing logic (tiered, member-based, currency conversion).
- **Checkout process** is developer-implemented — Xperience provides cart management services but the checkout UI and flow is custom code.
- **Order creation** converts shopping cart items to order records. The process is extensible via events and custom order creators.
- **Promotions** support discount types (percentage, fixed, free shipping) with condition-based rules (minimum order, specific products, contact groups).

## Related source code

| Area | Path |
|---|---|
| Commerce core | `./resources/repositories/xperience/CMSSolution/Commerce/` |
| Shopping cart | `./resources/repositories/xperience/CMSSolution/Commerce/ShoppingCart/` |
| Order management | `./resources/repositories/xperience/CMSSolution/Commerce/Order/` |
| Order manager | `./resources/repositories/xperience/CMSSolution/Commerce/OrderManager/` |
| Price calculation | `./resources/repositories/xperience/CMSSolution/Commerce/PriceCalculation/` |
| Promotions | `./resources/repositories/xperience/CMSSolution/Commerce/Promotion/` |
| Payment methods | `./resources/repositories/xperience/CMSSolution/Commerce/PaymentMethod/` |
| Shipping methods | `./resources/repositories/xperience/CMSSolution/Commerce/ShippingMethod/` |
| Admin commerce UI | `./resources/repositories/xperience/CMSSolution/Admin/Kentico.Xperience.Admin.DigitalCommerce/` |

## Cross-references

- Commerce stores (business user): [business-general.md](business-general.md) § Manage commerce stores
- Content types (product modeling): [dev-content-types.md](dev-content-types.md)
- Events (order events): [dev-events-and-customization.md](dev-events-and-customization.md)
