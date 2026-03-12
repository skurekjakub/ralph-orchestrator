# Commerce

This reference covers the commerce subsystem: customers, carts, orders, pricing, promotions, and payment/shipping infrastructure.

## Major Paths

| Path | What it contains |
|---|---|
| `./resources/repositories/xperience/CMSSolution/Commerce/Customer/` | Commerce customer domain |
| `./resources/repositories/xperience/CMSSolution/Commerce/ShoppingCart/` | Shopping cart behavior and cart state |
| `./resources/repositories/xperience/CMSSolution/Commerce/Order/` | Order model |
| `./resources/repositories/xperience/CMSSolution/Commerce/OrderManager/` | Order orchestration layer |
| `./resources/repositories/xperience/CMSSolution/Commerce/PriceCalculation/` | Pricing pipeline and price-calculation hooks |
| `./resources/repositories/xperience/CMSSolution/Commerce/Promotion/` | Promotions and discount logic |
| `./resources/repositories/xperience/CMSSolution/Commerce/PaymentMethod/` | Payment method model and behavior |
| `./resources/repositories/xperience/CMSSolution/Commerce/ShippingMethod/` | Shipping method model and behavior |
| `./resources/repositories/xperience/CMSSolution/Commerce/OrderStatus/` | Order status model and status transitions |
| `./resources/repositories/xperience/CMSSolution/Commerce/Services/` | Shared commerce services |

## Key Concepts

- Commerce is a distinct product subsystem rather than an add-on folder under websites or marketing.
- The subsystem is organized around order lifecycle concepts: cart, checkout, order creation, pricing, promotions, payment, and shipping.
- `OrderManager/` and `PriceCalculation/` are strong anchors for orchestration and extension work.
- There are separate notification-related roots inside commerce, which suggests commerce has dedicated event/notification behavior rather than relying only on generic notification infrastructure.
- Customer concepts exist here independently of broader contact-management concepts, so commerce customers and marketing contacts are related but not identical boundaries.

## Important Entry Points

| Kind | Path | Why it matters |
|---|---|---|
| Cart | `./resources/repositories/xperience/CMSSolution/Commerce/ShoppingCart/` | Core cart behavior surface |
| Order model | `./resources/repositories/xperience/CMSSolution/Commerce/Order/` | Central order domain |
| Order orchestration | `./resources/repositories/xperience/CMSSolution/Commerce/OrderManager/` | Checkout/order flow anchor |
| Pricing | `./resources/repositories/xperience/CMSSolution/Commerce/PriceCalculation/` | Extension seam for pricing behavior |
| Promotions | `./resources/repositories/xperience/CMSSolution/Commerce/Promotion/` | Discount and promotion engine |
| Payments | `./resources/repositories/xperience/CMSSolution/Commerce/PaymentMethod/` | Payment integration surface |
| Shipping | `./resources/repositories/xperience/CMSSolution/Commerce/ShippingMethod/` | Shipping integration surface |

## Cross-References

- Marketing and engagement: `source-marketing-and-engagement.md`
- Content and channels: `source-content-and-channels.md`
- Admin and web runtime: `source-admin-and-runtime.md`
