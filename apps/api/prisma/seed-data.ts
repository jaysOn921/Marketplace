// Reference data shared by the seed script and tests.

export const COUNTRIES = [
  {
    code: 'TZ',
    name: 'Tanzania',
    currencyCode: 'TZS',
    currencyMinorUnits: 0,
    phonePrefix: '+255',
    // 26 mainland regions + 5 Zanzibar regions
    regions: [
      'Arusha',
      'Dar es Salaam',
      'Dodoma',
      'Geita',
      'Iringa',
      'Kagera',
      'Katavi',
      'Kigoma',
      'Kilimanjaro',
      'Lindi',
      'Manyara',
      'Mara',
      'Mbeya',
      'Morogoro',
      'Mtwara',
      'Mwanza',
      'Njombe',
      'Pwani',
      'Rukwa',
      'Ruvuma',
      'Shinyanga',
      'Simiyu',
      'Singida',
      'Songwe',
      'Tabora',
      'Tanga',
      'Kaskazini Pemba',
      'Kusini Pemba',
      'Kaskazini Unguja',
      'Kusini Unguja',
      'Mjini Magharibi',
    ],
  },
  {
    code: 'ZM',
    name: 'Zambia',
    currencyCode: 'ZMW',
    currencyMinorUnits: 2,
    phonePrefix: '+260',
    regions: [
      'Central',
      'Copperbelt',
      'Eastern',
      'Luapula',
      'Lusaka',
      'Muchinga',
      'Northern',
      'North-Western',
      'Southern',
      'Western',
    ],
  },
] as const;

/**
 * Starting rate: 1 ZMW = 131.04 TZS (23 Oct 2026, set by the TZed team). Admins keep it current in
 * Admin → Exchange rate. Tests use a round 105 so expected amounts stay easy to check.
 */
export const SEED_RATE = {
  base: 'ZMW',
  quote: 'TZS',
  rate: process.env.NODE_ENV === 'test' ? '105.00000000' : '131.04000000',
} as const;

export const CATEGORIES: {
  name: string;
  slug: string;
  children?: { name: string; slug: string }[];
}[] = [
  {
    name: 'Electronics',
    slug: 'electronics',
    children: [
      { name: 'Phones & tablets', slug: 'phones-tablets' },
      { name: 'Computers & laptops', slug: 'computers-laptops' },
      { name: 'TV, audio & video', slug: 'tv-audio-video' },
      { name: 'Accessories', slug: 'electronics-accessories' },
    ],
  },
  {
    name: 'Home & furniture',
    slug: 'home-furniture',
    children: [
      { name: 'Furniture', slug: 'furniture' },
      { name: 'Kitchen & appliances', slug: 'kitchen-appliances' },
      { name: 'Home decor', slug: 'home-decor' },
    ],
  },
  {
    name: 'Fashion',
    slug: 'fashion',
    children: [
      { name: "Women's clothing", slug: 'womens-clothing' },
      { name: "Men's clothing", slug: 'mens-clothing' },
      { name: 'Shoes', slug: 'shoes' },
      { name: 'Fabrics & kitenge', slug: 'fabrics-kitenge' },
    ],
  },
  {
    name: 'Vehicles & parts',
    slug: 'vehicles-parts',
    children: [
      { name: 'Motorbikes & bicycles', slug: 'motorbikes-bicycles' },
      { name: 'Car parts & accessories', slug: 'car-parts' },
    ],
  },
  { name: 'Baby & kids', slug: 'baby-kids' },
  { name: 'Sports & outdoors', slug: 'sports-outdoors' },
  { name: 'Health & beauty', slug: 'health-beauty' },
  { name: 'Agriculture & tools', slug: 'agriculture-tools' },
  { name: 'Books & stationery', slug: 'books-stationery' },
  { name: 'Other', slug: 'other' },
];

export const FAQ_ARTICLES = [
  {
    slug: 'verified-sellers',
    topic: 'safety',
    title: 'Verified sellers, completed sales and reply times',
    body: `A "Verified seller" badge means the TZed team has checked the seller's identity (for example a national ID or business registration) and that their phone number and location are real. It doesn't guarantee every sale, so still follow the safety tips: pay only after the seller accepts your order, and check the item when you can.

"Completed sales" counts orders the seller has finished on TZed.

The reply time shows how quickly the seller usually answers TZed messages, based on the last 90 days. It appears once a seller has answered at least three conversations.

Sellers can ask to be verified by contacting support from the Help centre.`,
  },
  {
    slug: 'how-tzed-works',
    topic: 'getting-started',
    title: 'How TZed works',
    body: `TZed connects buyers and sellers in Tanzania and Zambia.

Sellers post items with a price in their own currency (shillings in Tanzania, kwacha in Zambia). Every listing is checked by our team before it appears on the site.

Buyers search or browse, message the seller, and place an order. You agree with the seller how the item is delivered and paid for.`,
  },
  {
    slug: 'currency-converter',
    topic: 'getting-started',
    title: 'Using the currency converter',
    body: `Open the converter from the TSh ⇄ K button at the top of any page, or go to the Converter page.

Type an amount in either box. Type kwacha to see shillings, or shillings to see kwacha. The other box updates straight away. Use the swap button to flip which currency is on top.

The rate is set by TZed and shown with the date it was last updated. Converted amounts are approximate. The price you agree with the seller is the one in the seller's currency.`,
  },
  {
    slug: 'buying-across-the-border',
    topic: 'buying',
    title: 'Buying from the other country',
    body: `Many Tanzanian sellers sell to buyers in Zambia, and the other way round.

Check that the listing says it is available in your country, and read the seller's delivery notes. Cross-border items usually travel by bus or courier through the Tunduma–Nakonde border.

Import duties and customs are agreed between you and the seller. TZed does not handle customs. Ask the seller about delivery cost and time before you order.`,
  },
  {
    slug: 'listing-approval',
    topic: 'selling',
    title: 'Why is my listing pending review?',
    body: `Every new listing is reviewed by a TZed admin before it goes live. This keeps the marketplace safe for everyone.

If your listing is approved, it appears in search and you get a notification. If it is rejected, you will see the reason. Fix the listing and submit it again.

Editing the title, description, price, category or photos sends the listing back for review. Changing the quantity or marking it sold does not.`,
  },
  {
    slug: 'paying-for-orders',
    topic: 'payments',
    title: 'How do I pay for an order?',
    body: `For now, payment happens directly between you and the seller, for example cash on collection or mobile money. Agree on the method with the seller before paying.

The seller marks the order as paid once they receive your money. Never send money to anyone who asks you to pay outside the agreed order.`,
  },
  {
    slug: 'staying-safe',
    topic: 'safety',
    title: 'Staying safe when buying and selling',
    body: `Meet in a public place when collecting items. Check the item before you pay. Keep your conversation on TZed so there is a record. Be careful with prices that look too good to be true.

If something seems wrong, report the listing or user and our team will look into it.`,
  },
  {
    slug: 'reporting-a-problem',
    topic: 'safety',
    title: 'Reporting a listing, user or message',
    body: `Use the Report button on a listing, profile or message. Choose a reason and add any details that help.

Our team reviews every report. You will be notified when the report has been handled.`,
  },
  {
    slug: 'prohibited-items',
    topic: 'selling',
    title: 'Items you cannot sell on TZed',
    body: `The following are not allowed: weapons and ammunition, drugs and medicines that need a prescription, counterfeit or stolen goods, wildlife products (ivory, skins, live wild animals), alcohol and tobacco, adult content, and anything illegal in Tanzania or Zambia.

Listings with prohibited items are rejected or removed, and repeat offenders are suspended.`,
  },
  {
    slug: 'contact-support',
    topic: 'getting-started',
    title: 'Contacting support',
    body: `If you can't find an answer here, open a support ticket from the Help centre. You can do this even without an account. We reply by email and in your TZed account.`,
  },
] as const;
