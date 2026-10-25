/**
 * Swahili for the text the server sends: error messages, notifications and emails.
 * Keys are the English text exactly as the code writes it; {name} matches a changing part.
 * When two templates could match the same text, put the longer (more specific) one first.
 */
export const SW: Record<string, string> = {
  // ─── General errors ──────────────────────────────────────────────────────
  'Something went wrong. Please try again.': 'Kuna hitilafu. Tafadhali jaribu tena.',
  'Please check the highlighted fields.': 'Tafadhali angalia sehemu zilizowekwa alama.',
  'Please sign in to continue.': 'Tafadhali ingia ili kuendelea.',
  'You do not have permission to do that.': 'Huna ruhusa ya kufanya hivyo.',
  'Not found.': 'Haikupatikana.',
  'The request is too large.': 'Ombi ni kubwa mno.',
  'The request could not be handled.': 'Ombi halikuweza kushughulikiwa.',
  'Request body is not valid JSON.': 'Maudhui ya ombi si JSON halali.',
  'Your session has expired. Please refresh and try again.':
    'Muda wa kipindi chako umeisha. Tafadhali onyesha upya ukurasa na ujaribu tena.',
  'Each photo must be 10 MB or smaller.': 'Kila picha iwe MB 10 au chini.',
  'Too many photos. A listing can have at most 8.':
    'Picha ni nyingi mno. Tangazo linaweza kuwa na picha 8 tu.',
  'The upload could not be read. Please try again.':
    'Faili halikuweza kusomeka. Tafadhali jaribu tena.',

  // ─── Sign in and account ─────────────────────────────────────────────────
  'Email or password is incorrect.': 'Barua pepe au nenosiri si sahihi.',
  'An account with this email already exists. Try signing in.':
    'Tayari kuna akaunti yenye barua pepe hii. Jaribu kuingia.',
  'That password is incorrect.': 'Nenosiri hilo si sahihi.',
  'Your current password is incorrect.': 'Nenosiri lako la sasa si sahihi.',
  'Your email is already confirmed.': 'Barua pepe yako tayari imethibitishwa.',
  'This link has already been used.': 'Kiungo hiki tayari kimetumika.',
  'This link is invalid or has expired.': 'Kiungo hiki si halali au muda wake umeisha.',
  'User not found.': 'Mtumiaji hakupatikana.',
  'Please confirm your email address before ordering.':
    'Tafadhali thibitisha barua pepe yako kabla ya kuagiza.',
  'Please confirm your email address before listing items.':
    'Tafadhali thibitisha barua pepe yako kabla ya kuweka matangazo.',
  'Please confirm your email address before sending messages.':
    'Tafadhali thibitisha barua pepe yako kabla ya kutuma ujumbe.',
  'This account has been suspended. Please contact support if you think this is a mistake.':
    'Akaunti hii imesimamishwa. Tafadhali wasiliana na huduma kwa wateja ukidhani ni kosa.',
  "You can't change your country after creating listings. Contact support if you've moved.":
    'Huwezi kubadilisha nchi baada ya kuweka matangazo. Wasiliana na huduma kwa wateja kama umehama.',
  'Set up your seller profile before listing items.':
    'Weka wasifu wako wa muuzaji kabla ya kuweka matangazo.',
  "This item isn't available to buyers in {country}.":
    'Bidhaa hii haipatikani kwa wanunuzi walioko {country}.',
  'Ordering across the border is paused until the exchange rate is updated.':
    'Kuagiza nje ya mpaka kumesimamishwa hadi kiwango cha ubadilishaji kisasishwe.',
  'A listing needs at least one photo. Add another before removing this one.':
    'Tangazo linahitaji angalau picha moja. Ongeza nyingine kabla ya kuondoa hii.',
  'This account is already active.': 'Akaunti hii tayari iko hai.',
  'This account is already suspended.': 'Akaunti hii tayari imesimamishwa.',

  // ─── Form checks ─────────────────────────────────────────────────────────
  'Enter a valid email address.': 'Weka barua pepe halali.',
  'Enter a name.': 'Weka jina.',
  'Enter your name.': 'Weka jina lako.',
  'Enter a shop name.': 'Weka jina la duka.',
  'Enter a title.': 'Weka kichwa.',
  'Enter the town or city.': 'Weka mji.',
  'Enter your town or city.': 'Weka mji wako.',
  'Enter your password.': 'Weka nenosiri lako.',
  'Enter your current password.': 'Weka nenosiri lako la sasa.',
  'Enter your password to confirm.': 'Weka nenosiri lako ili kuthibitisha.',
  'Enter a valid phone number.': 'Weka namba ya simu halali.',
  'Use at least {n} characters.': 'Tumia angalau herufi {n}.',
  'Use at most {n} characters.': 'Tumia herufi {n} au chache zaidi.',
  'At least 1.': 'Angalau 1.',
  'At most {n}.': 'Zisizozidi {n}.',
  'Add a short note about your decision.': 'Andika maelezo mafupi kuhusu uamuzi wako.',
  'Add a short subject.': 'Andika kichwa kifupi.',
  'Choose a rating from 1 to 5 stars.': 'Chagua nyota kuanzia 1 hadi 5.',
  'Choose at least one seller to order from.': 'Chagua angalau muuzaji mmoja wa kuagiza kwake.',
  'Describe the item in at least 20 characters.': 'Eleza bidhaa kwa angalau herufi 20.',
  'Explain the outcome to both sides (at least 10 characters).':
    'Eleza matokeo kwa pande zote mbili (angalau herufi 10).',
  'Give a short reason (shown to the person).': 'Toa sababu fupi (itaonyeshwa kwa mhusika).',
  'Please describe what happened (at least 10 characters).':
    'Tafadhali eleza kilichotokea (angalau herufi 10).',
  'Tell the seller what to fix (at least 5 characters).':
    'Mweleze muuzaji cha kurekebisha (angalau herufi 5).',
  'Tell us a bit more (at least 10 characters).': 'Tueleze zaidi kidogo (angalau herufi 10).',
  'That looks too high for TZS per ZMW.': 'Hiyo inaonekana juu mno kwa TZS kwa ZMW moja.',
  'That looks too low for TZS per ZMW.': 'Hiyo inaonekana chini mno kwa TZS kwa ZMW moja.',
  'That price is too high.': 'Bei hiyo ni kubwa mno.',
  'Write a message.': 'Andika ujumbe.',
  'Write a reply.': 'Andika jibu.',
  'Write at least a short paragraph.': 'Andika angalau aya fupi.',
  'Choose a category.': 'Chagua kundi.',
  'Choose a region or province in your country.': 'Chagua mkoa au jimbo katika nchi yako.',

  // ─── Listings and photos ─────────────────────────────────────────────────
  'Listing not found.': 'Tangazo halikupatikana.',
  'Photo not found.': 'Picha haikupatikana.',
  'Shop not found.': 'Duka halikupatikana.',
  'Category not found.': 'Kundi halikupatikana.',
  'This is not your listing.': 'Hili si tangazo lako.',
  'This listing is not available.': 'Tangazo hili halipatikani.',
  'This listing is no longer available.': 'Tangazo hili halipatikani tena.',
  'This listing is already removed.': 'Tangazo hili tayari limeondolewa.',
  'This listing is not marked as sold.': 'Tangazo hili halijawekwa kuwa limeuzwa.',
  'This listing is no longer waiting for review.': 'Tangazo hili halisubiri tena ukaguzi.',
  'Only drafts and rejected listings can be submitted for review.':
    'Rasimu na matangazo yaliyokataliwa pekee ndiyo yanaweza kutumwa kukaguliwa.',
  'Only live listings can be marked as sold.':
    'Matangazo hai pekee ndiyo yanaweza kuwekwa kuwa yameuzwa.',
  'Only removed listings can be restored.':
    'Matangazo yaliyoondolewa pekee ndiyo yanaweza kurejeshwa.',
  'Add at least one photo before submitting.': 'Weka angalau picha moja kabla ya kutuma.',
  'Choose at least one photo.': 'Chagua angalau picha moja.',
  'A listing can have at most {n} photos.': 'Tangazo linaweza kuwa na picha {n} tu.',
  'The photo list is out of date. Please refresh and try again.':
    'Orodha ya picha imepitwa na wakati. Tafadhali onyesha upya na ujaribu tena.',
  'This photo could not be read. Try another one.': 'Picha hii haikusomeka. Jaribu nyingine.',
  'This photo is too large. Use one under 60 megapixels.':
    'Picha hii ni kubwa mno. Tumia iliyo chini ya megapikseli 60.',
  'Upload photos as JPEG, PNG, WebP or HEIC images.':
    'Pakia picha za aina ya JPEG, PNG, WebP au HEIC.',
  'You can save up to {n} items. Remove some first.':
    'Unaweza kuhifadhi bidhaa hadi {n}. Ondoa baadhi kwanza.',

  // ─── Cart and orders ─────────────────────────────────────────────────────
  'Order not found.': 'Oda haikupatikana.',
  "You can't buy your own listing.": 'Huwezi kununua tangazo lako mwenyewe.',
  "You can't order your own listing.": 'Huwezi kuagiza tangazo lako mwenyewe.',
  'That item is not in your cart.': 'Bidhaa hiyo haipo kwenye kikapu chako.',
  'Your cart has changed. Please review it and try again.':
    'Kikapu chako kimebadilika. Tafadhali kikague na ujaribu tena.',
  'Each seller can only appear once.': 'Kila muuzaji anaweza kuonekana mara moja tu.',
  'At most {n} of one item per order.': 'Zisizozidi {n} za bidhaa moja kwa kila oda.',
  'Only {n} available.': 'Zinapatikana {n} tu.',
  'This order has changed. Please refresh to see its current status.':
    'Oda hii imebadilika. Tafadhali onyesha upya ili kuona hali yake ya sasa.',
  'You can’t do that on this order.': 'Huwezi kufanya hivyo kwenye oda hii.',

  // ─── Reviews ─────────────────────────────────────────────────────────────
  'Review not found.': 'Tathmini haikupatikana.',
  'Only the buyer can review this order.': 'Mnunuzi pekee ndiye anaweza kutathmini oda hii.',
  'You can review the seller once the order is completed.':
    'Unaweza kumtathmini muuzaji oda ikishakamilika.',
  'You have already reviewed this order.': 'Tayari umeitathmini oda hii.',
  'This review is already hidden.': 'Tathmini hii tayari imefichwa.',
  'This review is not hidden.': 'Tathmini hii haijafichwa.',

  // ─── Messages, reports, problems, support ────────────────────────────────
  'Conversation not found.': 'Mazungumzo hayakupatikana.',
  'Message not found.': 'Ujumbe haukupatikana.',
  'Choose who to write to.': 'Chagua unayemwandikia.',
  'This person can no longer receive messages.': 'Mtu huyu hawezi tena kupokea ujumbe.',
  'You can only message buyers who have ordered this listing.':
    'Unaweza kuwaandikia wanunuzi walioagiza tangazo hili pekee.',
  "You can't report your own listing.": 'Huwezi kuripoti tangazo lako mwenyewe.',
  "You can't report your own message.": 'Huwezi kuripoti ujumbe wako mwenyewe.',
  "You can't report yourself.": 'Huwezi kujiripoti mwenyewe.',
  "You've already reported this. Our team will look at it soon.":
    'Tayari umeripoti hili. Timu yetu italiangalia hivi karibuni.',
  'Problem not found.': 'Tatizo halikupatikana.',
  'Only the buyer or seller can report a problem with an order.':
    'Mnunuzi au muuzaji pekee ndiye anaweza kuripoti tatizo la oda.',
  'There is already an open problem on this order. Add to it below.':
    'Tayari kuna tatizo lililo wazi kwenye oda hii. Ongeza maelezo hapa chini.',
  'This problem has already been resolved.': 'Tatizo hili tayari limetatuliwa.',
  'This problem has been resolved.': 'Tatizo hili limetatuliwa.',
  'Ticket not found.': 'Tiketi haikupatikana.',
  'This ticket is closed. Please open a new one.': 'Tiketi hii imefungwa. Tafadhali fungua mpya.',
  'Help article not found.': 'Makala ya msaada haikupatikana.',
  'Article not found.': 'Makala haikupatikana.',

  // ─── Words used inside other messages ────────────────────────────────────
  buyer: 'mnunuzi',
  seller: 'muuzaji',
  'item not received': 'bidhaa haikupokelewa',
  'item not as described': 'bidhaa si kama ilivyoelezwa',
  'item damaged': 'bidhaa imeharibika',
  'payment problem': 'tatizo la malipo',
  'the other person stopped responding': 'upande mwingine umeacha kujibu',
  other: 'jingine',
  '{first} and {n} other items': '{first} na bidhaa nyingine {n}',
  '{first} and 1 other item': '{first} na bidhaa nyingine 1',

  // ─── Notifications ───────────────────────────────────────────────────────
  'New order': 'Oda mpya',
  '{name} ordered {units} × {item} ({total}). Accept or decline it.':
    '{name} ameagiza {units} × {item} ({total}). Ikubali au uikatae.',
  '{name} ordered {item} ({total}). Accept or decline it.':
    '{name} ameagiza {item} ({total}). Ikubali au uikatae.',
  'Order accepted': 'Oda imekubaliwa',
  'The seller accepted your order for {item}. You can now see their contact details.':
    'Muuzaji amekubali oda yako ya {item}. Sasa unaweza kuona mawasiliano yake.',
  'Order declined': 'Oda imekataliwa',
  'The seller declined your order for {item}. Reason: {reason}':
    'Muuzaji amekataa oda yako ya {item}. Sababu: {reason}',
  'The seller declined your order for {item}.': 'Muuzaji amekataa oda yako ya {item}.',
  'Buyer received the item': 'Mnunuzi amepokea bidhaa',
  'The buyer confirmed they received {item}. You can now mark the order completed.':
    'Mnunuzi amethibitisha kupokea {item}. Sasa unaweza kuweka oda kuwa imekamilika.',
  'Buyer says they paid': 'Mnunuzi anasema amelipa',
  'The buyer says they have paid for {item}. Check you received it, then record the payment.':
    'Mnunuzi anasema amelipia {item}. Hakikisha umepokea malipo, kisha uyarekodi.',
  'Order ready': 'Oda iko tayari',
  '{item} is ready for collection or on its way.': '{item} iko tayari kuchukuliwa au iko njiani.',
  'Order completed': 'Oda imekamilika',
  'The order for {item} is complete.': 'Oda ya {item} imekamilika.',
  'Order cancelled': 'Oda imeghairiwa',
  'The order for {item} was cancelled. Reason: {reason}':
    'Oda ya {item} imeghairiwa. Sababu: {reason}',
  'The order for {item} was cancelled.': 'Oda ya {item} imeghairiwa.',
  'Payment recorded': 'Malipo yamerekodiwa',
  'The seller recorded your payment for {item}.': 'Muuzaji amerekodi malipo yako ya {item}.',

  'Your listing is live': 'Tangazo lako liko hewani',
  '“{title}” was approved and is now visible to buyers.':
    '“{title}” limeidhinishwa na sasa linaonekana kwa wanunuzi.',
  'Your listing needs changes': 'Tangazo lako linahitaji marekebisho',
  '“{title}” was not approved. Reason: {reason}\nEdit the listing and submit it again.':
    '“{title}” halikuidhinishwa. Sababu: {reason}\nHariri tangazo kisha ulitume tena.',
  'Your listing was removed': 'Tangazo lako limeondolewa',
  'Your listing was restored': 'Tangazo lako limerejeshwa',
  '“{title}” was removed by the TZed team. Reason: {reason}':
    '“{title}” limeondolewa na timu ya TZed. Sababu: {reason}',
  '“{title}” was restored by the TZed team. Reason: {reason}':
    '“{title}” limerejeshwa na timu ya TZed. Sababu: {reason}',
  'Price drop on a saved item': 'Bei imeshuka kwa bidhaa uliyohifadhi',
  '“{title}” is now {to} (was {from}).': '“{title}” sasa ni {to} (awali {from}).',

  'Your shop is now a verified seller': 'Duka lako sasa ni muuzaji aliyethibitishwa',
  'The TZed team has checked {shop}. Buyers now see a “Verified seller” badge on your shop and listings.':
    'Timu ya TZed imelikagua {shop}. Sasa wanunuzi wanaona beji ya “Muuzaji aliyethibitishwa” kwenye duka na matangazo yako.',
  'Your verified seller badge was removed': 'Beji yako ya muuzaji aliyethibitishwa imeondolewa',
  'The “Verified seller” badge was removed from {shop}. Reason: {reason}':
    'Beji ya “Muuzaji aliyethibitishwa” imeondolewa kwenye {shop}. Sababu: {reason}',

  'New {n}-star review': 'Tathmini mpya ya nyota {n}',
  '{name} rated you {stars} for “{title}”. “{comment}”':
    '{name} amekupa {stars} kwa “{title}”. “{comment}”',
  '{name} rated you {stars} for “{title}”.': '{name} amekupa {stars} kwa “{title}”.',
  'Your review was hidden': 'Tathmini yako imefichwa',
  'Your review for “{title}” was hidden from the shop page by the TZed team. Reason: {reason}':
    'Tathmini yako ya “{title}” imefichwa kwenye ukurasa wa duka na timu ya TZed. Sababu: {reason}',
  'Your review is visible again': 'Tathmini yako inaonekana tena',
  'Your review for “{title}” is back on the shop page. Note from the TZed team: {note}':
    'Tathmini yako ya “{title}” imerudi kwenye ukurasa wa duka. Ujumbe kutoka timu ya TZed: {note}',

  'New message from {name}': 'Ujumbe mpya kutoka kwa {name}',
  'About “{title}”: {body}': 'Kuhusu “{title}”: {body}',
  Reply: 'Jibu',
  'Open TZed': 'Fungua TZed',

  'Your report was reviewed': 'Ripoti yako imekaguliwa',
  "Thanks for your report about {what}. We reviewed it and didn't find a breach of our rules.":
    'Asante kwa ripoti yako kuhusu {what}. Tumeikagua na hatukupata ukiukaji wa sheria zetu.',
  'Thanks for your report about {what}. We reviewed it and took action.':
    'Asante kwa ripoti yako kuhusu {what}. Tumeikagua na kuchukua hatua.',
  'Your listing “{title}” was removed': 'Tangazo lako “{title}” limeondolewa',
  'One of your messages was removed': 'Mojawapo ya ujumbe wako umeondolewa',
  'Your account was suspended': 'Akaunti yako imesimamishwa',
  '{what} after a review by the TZed team. Reason: {reason}\nIf you think this is a mistake, contact support from the Help centre.':
    '{what} baada ya ukaguzi wa timu ya TZed. Sababu: {reason}\nUkidhani ni kosa, wasiliana na huduma kwa wateja kupitia Kituo cha msaada.',

  'Problem reported on order #{id}': 'Tatizo limeripotiwa kwenye oda #{id}',
  'The {role} reported a problem with {item} ({reason}). The TZed team will help sort it out. Reply on the order page.':
    '{role} ameripoti tatizo kuhusu {item} ({reason}). Timu ya TZed itasaidia kulitatua. Jibu kwenye ukurasa wa oda.',
  'New problem on order #{id}': 'Tatizo jipya kwenye oda #{id}',
  'The {role} reported: {reason}.': '{role} ameripoti: {reason}.',
  'TZed support replied about order #{id}': 'Huduma kwa wateja ya TZed imejibu kuhusu oda #{id}',
  'New reply about the problem on order #{id}': 'Jibu jipya kuhusu tatizo la oda #{id}',
  'Problem on order #{id} resolved': 'Tatizo la oda #{id} limetatuliwa',
  'The TZed team has resolved the problem: {resolution}':
    'Timu ya TZed imetatua tatizo: {resolution}',

  'Support replied to #{id}': 'Huduma kwa wateja imejibu #{id}',

  // ─── Emails ──────────────────────────────────────────────────────────────
  'Hi {name},': 'Habari {name},',
  '— The TZed team': '— Timu ya TZed',
  "You're receiving this because you have a TZed account. TZed connects buyers and sellers in Tanzania and Zambia.":
    'Unapokea ujumbe huu kwa sababu una akaunti ya TZed. TZed inaunganisha wanunuzi na wauzaji Tanzania na Zambia.',
  '{title} — TZed': '{title} — TZed',
  'Confirm your email for TZed': 'Thibitisha barua pepe yako kwa TZed',
  'Welcome to TZed! Please confirm your email address so you can buy and sell.':
    'Karibu TZed! Tafadhali thibitisha barua pepe yako ili uweze kununua na kuuza.',
  'Confirm my email': 'Thibitisha barua pepe yangu',
  "The link expires in 48 hours. If you didn't create an account, you can ignore this email.":
    'Kiungo kitaisha baada ya saa 48. Kama hukufungua akaunti, unaweza kupuuza barua pepe hii.',
  'Reset your TZed password': 'Badilisha nenosiri lako la TZed',
  'We received a request to reset your password. Choose a new one with the button below.':
    'Tumepokea ombi la kubadilisha nenosiri lako. Chagua jipya kwa kitufe kilicho hapa chini.',
  'Choose a new password': 'Chagua nenosiri jipya',
  "The link expires in 1 hour and works once. If you didn't ask for this, ignore this email: your password won't change.":
    'Kiungo kitaisha baada ya saa 1 na kinafanya kazi mara moja tu. Kama hukuomba hili, puuza barua pepe hii: nenosiri lako halitabadilika.',
  'Your TZed account has been suspended': 'Akaunti yako ya TZed imesimamishwa',
  'Your TZed account is active again': 'Akaunti yako ya TZed iko hai tena',
  'Your account has been suspended by the TZed team.':
    'Akaunti yako imesimamishwa na timu ya TZed.',
  'Your account has been reinstated. You can sign in again.':
    'Akaunti yako imerejeshwa. Unaweza kuingia tena.',
  'Reason: {reason}': 'Sababu: {reason}',
  'Contact support': 'Wasiliana na huduma kwa wateja',
  'Sign in': 'Ingia',
  'We received your message: {subject} [#{id}]': 'Tumepokea ujumbe wako: {subject} [#{id}]',
  'Thanks for contacting TZed support. Your ticket number is #{id}. We usually reply within one working day.':
    'Asante kwa kuwasiliana na huduma kwa wateja ya TZed. Namba ya tiketi yako ni #{id}. Kwa kawaida tunajibu ndani ya siku moja ya kazi.',
  'You wrote: “{body}”': 'Uliandika: “{body}”',
  'View your ticket': 'Tazama tiketi yako',
  'Keep this email: the link is how you follow and reply to your ticket.':
    'Hifadhi barua pepe hii: kiungo ndiyo njia ya kufuatilia na kujibu tiketi yako.',
  'TZed support replied to your ticket #{id}:':
    'Huduma kwa wateja ya TZed imejibu tiketi yako #{id}:',
  'View ticket': 'Tazama tiketi',
  'Use the link in this email (links in earlier emails no longer work).':
    'Tumia kiungo kilicho kwenye barua pepe hii (viungo vya barua pepe za awali havifanyi kazi tena).',
};
