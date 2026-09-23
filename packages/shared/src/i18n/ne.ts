// Nepali is the default UI language (F-10, ADR-020). Keys and wording follow the copy deck in
// ui-ux-context §8; add new user-visible strings there too. `{name}` marks a parameter.
// Lines marked `i18n-review` are best-effort Nepali for Binayak to check.

export const ne = {
  "app.name": "मेरो पसल",

  "nav.today": "आज",
  "nav.bills": "बिलहरू",
  "nav.accounts": "खाता",

  "action.sale": "बेचेको बिल",
  "action.sale.sub": "ग्राहकलाई बेचेको",
  "action.purchase": "किनेको बिल",
  "action.purchase.sub": "सप्लायरबाट किनेको",

  "kind.sale": "बेचेको",
  "kind.purchase": "किनेको",
  "filter.all": "सबै",

  "today.billed": "आजका बिल",
  "today.noAmount": "रकम नहालेका",
  "today.empty": "आज कुनै बिल छैन। माथिको बटन थिचेर पहिलो बिल राख्नुहोस्।",
  "today.seeAll": "सबै हेर्नुहोस्",

  "common.back": "पछाडि",
  "capture.page": "पाना {n}",
  "capture.photoAlt": "बिलको फोटो, पाना {n}",
  "capture.hint": "बिल पूरै देखिने गरी खिच्नुहोस्",
  "capture.maxPages": "बढीमा {n} पाना", // i18n-review
  "capture.leave": "बिल नराखी फर्कने?",
  "capture.leaveSub": "खिचेको फोटो हट्छ।", // i18n-review
  "capture.leaveYes": "हो, फर्कने", // i18n-review
  "capture.leaveNo": "होइन, बस्ने", // i18n-review
  "photo.use": "ठीक छ",
  "photo.retake": "फेरि खिच्नुहोस्",
  "photo.addPage": "अर्को पाना",

  "party.title": "कसको बिल?",
  "party.search": "नाम खोज्नुहोस् (नेपाली वा English)",
  "party.walkIn": "नगद ग्राहक",
  "party.recent": "हालैका",
  "party.add": "नयाँ नाम थप्नुहोस्",
  "party.later": "पछि",
  "party.save": "नाम राख्नुहोस्",
  "party.similar": "यस्तै नाम पहिले नै छ",
  "party.same": "हो, उही हो",
  "party.new": "होइन, नयाँ बनाउनुहोस्",
  "party.notFound": "“{q}” नाम अहिलेसम्म छैन",
  "party.addThis": "“{q}” नाम थप्नुहोस्",
  "party.notThem": "“{q}” अर्कै मान्छे हो? नयाँ थप्नुहोस्",
  "party.isItThis": "यीमध्ये कोही हो?",
  "party.results": "खोजेका",
  "party.walkInSub": "नाम नचाहिने बिक्री",
  "party.newTitle": "नयाँ नाम",
  "party.fieldName": "नाम",
  "party.nameHint": "एउटै नाम धेरै भए नाममै एउटा शब्द थप्नुहोस्, जस्तै “राम स्कूल”", // i18n-review
  "party.fieldPhone": "फोन (नभए खाली)",
  "party.fieldTag": "चिनाउने शब्द (नभए खाली)",
  "party.fieldTagHint": "जस्तै: चोक, ड्राइभर, पसल छेउ",
  "party.confirmName": "नाम ठीक छ?",
  "party.confirmSub": "सुनेको नाम हो। मिलेन भने सच्याएर राख्नुहोस्।",

  "voice.listening": "सुन्दैछ… नाम भन्नुहोस्",
  "voice.heard": "सुनियो",
  "voice.sayAgain": "फेरि भन्नुहोस्",
  "voice.needsInternet": "इन्टरनेट चाहिन्छ",

  "amount.title": "जम्मा कति?",
  "amount.later": "रकम पछि हाल्छु",

  "amount.delete": "मेटाउनुहोस्", // i18n-review
  "amount.saveSoon": "बिल राख्ने काम अर्को अपडेटमा आउँछ।", // i18n-review
  "date.label": "मिति",
  "date.prevMonth": "अघिल्लो महिना",
  "date.nextMonth": "अर्को महिना",
  "party.noName": "नाम छैन",
  "photo.enlarge": "फोटो ठूलो गर्नुहोस्", // i18n-review
  "common.close": "बन्द गर्नुहोस्",
  "date.today": "आज",
  "date.yesterday": "हिजो",
  "date.dayBefore": "अस्ति",
  "date.pick": "अरू मिति",

  "bill.save": "बिल राख्नुहोस्",
  "bill.saved": "राखियो",
  "bill.correct": "सच्याउनुहोस्",
  "bill.remove": "हटाउनुहोस्",
  "bill.removeConfirm": "यो बिल हटाउने?",
  "bill.removed": "हटाइयो",
  "bill.noAmount": "रकम छैन",

  "sync.ok": "सबै सुरक्षित",
  "sync.pending": "{n} पठाउन बाँकी",
  "sync.offline": "इन्टरनेट छैन — बिल फोनमा सुरक्षित छन्",
  "sync.failed": "पठाउन सकिएन",
  "sync.stale": "(पुरानो)",

  "offline.title": "इन्टरनेट छैन",
  "offline.body": "इन्टरनेट आएपछि एप फेरि खोल्नुहोस्।", // i18n-review

  // v1.1 (F-20 … F-23); kept here so the copy deck lives in one place.
  "pay.cash": "नगद",
  "pay.qr": "QR",
  "pay.udharo": "उधारो",
  "pay.partUdharo": "केही उधारो",
  "pay.paid": "तिरेँ",
  "pay.due": "बाँकी",
  "pay.partDue": "केही बाँकी",
  "account.balance": "बाँकी",
  "account.received": "पैसा आयो",
  "dayClose.title": "दिनको हिसाब",

  "auth.notInvited": "तपाईंलाई यो पसलमा थपिएको छैन। बिनायकलाई सम्पर्क गर्नुहोस्।",
  "auth.signInSub": "Google खाताबाट भित्र पस्नुहोस्", // i18n-review
  "auth.signOut": "बाहिर निस्कनुहोस्", // i18n-review

  "lang.switch": "भाषा बदल्नुहोस्", // i18n-review
  "lang.ne": "नेपाली",
  "lang.en": "English",
  "settings.open": "सेटिङ",

  "common.cancel": "रद्द गर्नुहोस्",
  "common.undo": "फर्काउनुहोस्",

  // Architecture §6 error contract: one message per ConvexError code.
  "error.UNAUTHENTICATED": "फेरि साइन इन गर्नुहोस्।", // i18n-review
  "error.FORBIDDEN": "तपाईंलाई यो काम गर्ने अनुमति छैन।", // i18n-review
  "error.NOT_FOUND": "यो भेटिएन। हटाइएको हुन सक्छ।", // i18n-review
  "error.VALIDATION": "केही मिलेन। जाँचेर फेरि प्रयास गर्नुहोस्।", // i18n-review
  "error.CONFLICT": "यो पहिले नै छ।", // i18n-review
  "error.unknown": "केही गडबड भयो। फेरि प्रयास गर्नुहोस्।", // i18n-review
} as const;
