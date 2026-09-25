/*
  Georgian / English copy. index.html carries the Georgian text as the
  default; elements tagged data-i18n="key" (text) or data-i18n-html="key"
  (markup, for headings with green spans) are swapped for the chosen language
  before any text splitting or animation runs. data-i18n-attr="attr:key;…"
  covers aria-labels and alt text.

  The language comes from ?lang=en|ka, then the last choice saved on this
  device, then Georgian.
*/

export const LANGS = ['ka', 'en'];
const STORE_KEY = 'sachukardi-lang';

const dict = {
  ka: {
    'meta.title': 'საჩუქარდი — უნივერსალური სასაჩუქრე ბარათი',
    'meta.description': 'შეუკვეთე საჩუქარდი ონლაინ და აჩუქე შესაძლებლობა, შეიძინოს რაც უნდა და სადაც უნდა.',
    'nav.why': 'რატომ საჩუქარდი',
    'nav.how': 'როგორ მუშაობს',
    'nav.where': 'სად გამოვიყენო',
    'nav.order': 'შეუკვეთე',
    'nav.home': 'საჩუქარდი — მთავარი',
    'nav.aria': 'მთავარი ნავიგაცია',
    'lang.aria': 'ენის არჩევა',

    'hero.eyebrow': 'უნივერსალური სასაჩუქრე ბარათი',
    'hero.title1': 'ᲨᲔᲣᲙᲕᲔᲗᲔ',
    'hero.title2': 'ᲡᲐᲩᲣᲥᲐᲠᲓᲘ',
    'hero.lead': 'შეუკვეთე ონლაინ და აჩუქე შესაძლებლობა — შეიძინოს რაც უნდა და სადაც უნდა.',
    'hero.order': 'შეუკვეთე ახლავე',
    'hero.how': 'როგორ მუშაობს',
    'hero.scroll': 'ჩამოსქროლე',

    'slogan.eyebrow': 'საჩუქარდი',
    'slogan.big': 'ყველაფრისთვის, რისი ყიდვაც გინდა',

    'step1.title': 'შეუკვეთე ონლაინ',
    'step1.text': 'აირჩიე თანხა, შეავსე რამდენიმე ველი და გადაიხადე ონლაინ — რიგების და ლოდინის გარეშე.',
    'step2.title': 'აჩუქე შესაძლებლობა',
    'step2.text': 'გაუგზავნე საჩუქარდი მხოლოდ მობილურის ნომრით — ადრესატი ბარათის ბმულს SMS-ით მომენტალურად მიიღებს.',
    'step3.title': 'შეიძინოს რაც უნდა და სადაც უნდა',
    'step3.text': 'ერთი ბარათი — ტანსაცმელი, ტექნიკა, რესტორანი თუ მოგზაურობა. არჩევანი მთლიანად მის ხელშია.',

    'how.eyebrow': 'როგორ მუშაობს',
    'how.title': 'საჩუქარი <span class="green">4 ნაბიჯში</span>',
    'how1.mock': 'სხვა თანხა',
    'how1.title': 'აირჩიე თანხა',
    'how1.text': 'ნებისმიერი თანხა 3 000 ₾-მდე — შენ წყვეტ, რამდენად დიდი იქნება საჩუქარი.',
    'how2.self': 'ჩემთვის',
    'how2.gift': 'საჩუქრად',
    'how2.title': 'მიუთითე ადრესატი',
    'how2.text': 'ჩემთვის თუ საჩუქრად — საკმარისია მხოლოდ მობილურის ნომერი.',
    'how3.card': 'ბარათით',
    'how3.transfer': 'გადარიცხვით',
    'how3.title': 'გადაიხადე ონლაინ',
    'how3.text': 'ბარათით ან საბანკო გადარიცხვით — სწრაფად და უსაფრთხოდ.',
    'how4.sms': '<b>საჩუქარდი</b>შენ მიიღე სასაჩუქრე ბარათი 🎁<br /><u>link.payunicard.ge/•••</u>',
    'how4.time': 'ახლახან',
    'how4.title': 'SMS მომენტალურად',
    'how4.text': 'ადრესატი ბარათის ბმულს SMS-ით მაშინვე იღებს — საჩუქარი უკვე მის ხელშია.',

    'where.eyebrow': 'სად გამოვიყენო',
    'where.title': 'შეიძინოს <span class="green">რაც უნდა</span><br />და <span class="green">სადაც უნდა</span>',
    'cat.shopping': 'შოპინგი',
    'cat.clothing': 'ტანსაცმელი',
    'cat.grocery': 'სუპერმარკეტი',
    'cat.beauty': 'კოსმეტიკა',
    'cat.fuel': 'საწვავი',
    'cat.events': 'კინო და ღონისძიებები',
    'cat.malls': 'სავაჭრო ცენტრები',
    'cat.food': 'რესტორნები',
    'band.1': 'ყველაფრისთვის',
    'band.2': 'რისი ყიდვაც გინდა',
    'band.3': 'აჩუქე შესაძლებლობა',

    'stat1': 'მაქსიმალური თანხა ერთ ბარათზე',
    'stat2': 'და ბარათი უკვე ადრესატთანაა',
    'stat3': 'ონლაინ — ფილიალში მისვლის გარეშე',

    'cta.sub': 'უნივერსალური სასაჩუქრე ბარათი — ყველაფრისთვის, რისი ყიდვაც გინდა.',
    'cta.order': 'შეუკვეთე ონლაინ',
    'footer.rights': 'ყველა უფლება დაცულია.',
    'footer.order': 'შეკვეთა',

    // painted on the back of the 3D card
    'card.back1': 'ყველაფრისთვის, რისი ყიდვაც გინდა',
    'card.back2': 'უნივერსალური სასაჩუქრე ბარათი',
  },

  en: {
    'meta.title': 'Sachukardi — Universal Gift Card',
    'meta.description': 'Order Sachukardi online and gift the freedom to buy whatever they want, wherever they want.',
    'nav.why': 'Why Sachukardi',
    'nav.how': 'How it works',
    'nav.where': 'Where to use',
    'nav.order': 'Order',
    'nav.home': 'Sachukardi — home',
    'nav.aria': 'Main navigation',
    'lang.aria': 'Choose language',

    'hero.eyebrow': 'Universal gift card',
    'hero.title1': 'ORDER',
    'hero.title2': 'SACHUKARDI',
    'hero.lead': 'Order online and gift the freedom to buy whatever they want, wherever they want.',
    'hero.order': 'Order now',
    'hero.how': 'How it works',
    'hero.scroll': 'Scroll',

    'slogan.eyebrow': 'Sachukardi',
    'slogan.big': 'For everything you want to buy',

    'step1.title': 'Order online',
    'step1.text': 'Pick an amount, fill in a few fields and pay online — no queues, no waiting.',
    'step2.title': 'Gift the freedom to choose',
    'step2.text': 'Send Sachukardi with nothing but a mobile number — the recipient gets the card link by SMS, instantly.',
    'step3.title': 'Whatever they want, wherever they want',
    'step3.text': 'One card for clothes, electronics, restaurants or travel. The choice is entirely theirs.',

    'how.eyebrow': 'How it works',
    'how.title': 'A gift in <span class="green">4 steps</span>',
    'how1.mock': 'Other amount',
    'how1.title': 'Choose an amount',
    'how1.text': 'Any amount up to 3,000 ₾ — you decide how big the gift is.',
    'how2.self': 'For me',
    'how2.gift': 'As a gift',
    'how2.title': 'Add the recipient',
    'how2.text': 'For yourself or as a gift — all it takes is a mobile number.',
    'how3.card': 'By card',
    'how3.transfer': 'Bank transfer',
    'how3.title': 'Pay online',
    'how3.text': 'By card or bank transfer — fast and secure.',
    'how4.sms': '<b>Sachukardi</b>You’ve received a gift card 🎁<br /><u>link.payunicard.ge/•••</u>',
    'how4.time': 'Just now',
    'how4.title': 'Instant SMS',
    'how4.text': 'The recipient gets the card link by SMS right away — the gift is already in their hands.',

    'where.eyebrow': 'Where to use',
    'where.title': 'Buy <span class="green">whatever</span> they want,<br /><span class="green">wherever</span> they want',
    'cat.shopping': 'Shopping',
    'cat.clothing': 'Clothing',
    'cat.grocery': 'Supermarkets',
    'cat.beauty': 'Beauty',
    'cat.fuel': 'Fuel',
    'cat.events': 'Cinema & events',
    'cat.malls': 'Shopping malls',
    'cat.food': 'Restaurants',
    'band.1': 'For everything',
    'band.2': 'you want to buy',
    'band.3': 'Gift the freedom',

    'stat1': 'maximum amount per card',
    'stat2': 'and the card is with the recipient',
    'stat3': 'online — no branch visit needed',

    'cta.sub': 'The universal gift card — for everything you want to buy.',
    'cta.order': 'Order online',
    'footer.rights': 'All rights reserved.',
    'footer.order': 'Order',

    'card.back1': 'For everything you want to buy',
    'card.back2': 'Universal gift card',
  },
};

function readStored() {
  try { return localStorage.getItem(STORE_KEY); } catch { return null; }
}

export function detectLang() {
  const q = new URLSearchParams(window.location.search).get('lang');
  if (LANGS.includes(q)) return q;
  const saved = readStored();
  return LANGS.includes(saved) ? saved : 'ka';
}

export function saveLang(lang) {
  try { localStorage.setItem(STORE_KEY, lang); } catch { /* private mode etc. — the URL still carries it */ }
}

export function t(lang, key) {
  return dict[lang]?.[key] ?? dict.ka[key] ?? key;
}

export function applyLang(lang) {
  document.documentElement.lang = lang;
  document.title = t(lang, 'meta.title');
  document.querySelector('meta[name="description"]')?.setAttribute('content', t(lang, 'meta.description'));

  // Georgian is already in the markup
  if (lang !== 'ka') {
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(lang, el.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(lang, el.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
      el.dataset.i18nAttr.split(';').forEach((pair) => {
        const [attr, key] = pair.split(':');
        el.setAttribute(attr, t(lang, key));
      });
    });
  }

  document.querySelectorAll('[data-set-lang]').forEach((btn) => {
    const on = btn.dataset.setLang === lang;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-pressed', String(on));
  });
}
