/**
 * The backend's own, small string catalog.
 *
 * This is deliberately not i18next and does not import the frontend's
 * `translation.json` bundles (`libraries/react-shared-libraries/src/translation`).
 * Those exist for a UI that renders in a browser with a language the browser
 * or a cookie already resolved; this catalog exists for the handful of
 * strings NestJS itself has to choose a language for — a few email templates
 * and the content-workflow starter labels — and has no browser, no i18next
 * runtime, and no reason to share a lifecycle with sixteen locale bundles of
 * UI copy. A gap here always falls back to English rather than throwing or
 * printing an empty string, because a missed translation must never break
 * registration or a password reset.
 *
 * This file has no imports of its own on purpose: several tests load it
 * verbatim as a dependency-free stand-in for the real translation logic (see
 * `tests/user-identity.auth.test.cjs` and siblings), and a relative or
 * `@contentfactory/*` import here would force every one of those tests to
 * also mock that import.
 */

export const BACKEND_LOCALES = [
  'en',
  'he',
  'ru',
  'zh',
  'fr',
  'es',
  'pt',
  'de',
  'it',
  'ja',
  'ko',
  'ar',
  'tr',
  'vi',
  'bn',
  'ka_ge',
] as const;

export type BackendLocale = (typeof BACKEND_LOCALES)[number];

export const BACKEND_FALLBACK_LOCALE: BackendLocale = 'en';

/**
 * An unknown, empty or non-string value always resolves to English. Never
 * throws: this runs on the registration path and inside email sending, and
 * neither may fail because a stored or submitted language turned out to be
 * garbage.
 */
export function resolveBackendLocale(value: unknown): BackendLocale {
  return typeof value === 'string' &&
    (BACKEND_LOCALES as readonly string[]).includes(value)
    ? (value as BackendLocale)
    : BACKEND_FALLBACK_LOCALE;
}

export type BackendStringParams = Record<string, string | number>;

type BackendStringEntry = Record<BackendLocale, string>;

/**
 * ka_ge and bn entries below are machine-checked for structure only — no
 * native reviewer has read them. Everything else is a direct, unassisted
 * translation. None of the sixteen locales was skipped back to English: see
 * the report for which two carry that caveat.
 */
const CATALOG = {
  content_workflow_tag_plan: {
    en: 'Plan',
    he: 'תוכנית',
    ru: 'План',
    zh: '计划',
    fr: 'Plan',
    es: 'Plan',
    pt: 'Plano',
    de: 'Plan',
    it: 'Piano',
    ja: 'プラン',
    ko: '계획',
    ar: 'خطة',
    tr: 'Plan',
    vi: 'Kế hoạch',
    bn: 'পরিকল্পনা',
    ka_ge: 'გეგმა',
  },
  content_workflow_tag_draft: {
    en: 'Draft',
    he: 'טיוטה',
    ru: 'Черновик',
    zh: '草稿',
    fr: 'Brouillon',
    es: 'Borrador',
    pt: 'Rascunho',
    de: 'Entwurf',
    it: 'Bozza',
    ja: '下書き',
    ko: '초안',
    ar: 'مسودة',
    tr: 'Taslak',
    vi: 'Bản nháp',
    bn: 'খসড়া',
    ka_ge: 'მონახაზი',
  },
  content_workflow_tag_review: {
    en: 'Review',
    he: 'סקירה',
    ru: 'Проверка',
    zh: '审核',
    fr: 'Révision',
    es: 'Revisión',
    pt: 'Revisão',
    de: 'Prüfung',
    it: 'Revisione',
    ja: 'レビュー',
    ko: '검토',
    ar: 'مراجعة',
    tr: 'İnceleme',
    vi: 'Xem xét',
    bn: 'পর্যালোচনা',
    ka_ge: 'განხილვა',
  },
  content_workflow_tag_schedule: {
    en: 'Schedule',
    he: 'לוח זמנים',
    ru: 'Расписание',
    zh: '排期',
    fr: 'Planning',
    es: 'Programación',
    pt: 'Agenda',
    de: 'Zeitplan',
    it: 'Pianificazione',
    ja: 'スケジュール',
    ko: '일정',
    ar: 'جدول',
    tr: 'Program',
    vi: 'Lịch trình',
    bn: 'সময়সূচী',
    ka_ge: 'განრიგი',
  },
  email_activate_account_subject: {
    en: 'Activate your account',
    he: 'הפעילו את החשבון שלכם',
    ru: 'Активируйте аккаунт',
    zh: '激活您的账户',
    fr: 'Activez votre compte',
    es: 'Activa tu cuenta',
    pt: 'Ative sua conta',
    de: 'Aktivieren Sie Ihr Konto',
    it: 'Attiva il tuo account',
    ja: 'アカウントを有効化してください',
    ko: '계정을 활성화하세요',
    ar: 'فعّل حسابك',
    tr: 'Hesabınızı etkinleştirin',
    vi: 'Kích hoạt tài khoản của bạn',
    bn: 'আপনার অ্যাকাউন্ট সক্রিয় করুন',
    ka_ge: 'გაააქტიურეთ თქვენი ანგარიში',
  },
  email_activate_account_body: {
    en: 'Click <a href="{{link}}">here</a> to activate your account',
    he: 'לחצו <a href="{{link}}">כאן</a> כדי להפעיל את החשבון שלכם',
    ru: 'Нажмите <a href="{{link}}">здесь</a>, чтобы активировать аккаунт',
    zh: '点击<a href="{{link}}">此处</a>激活您的账户',
    fr: 'Cliquez <a href="{{link}}">ici</a> pour activer votre compte',
    es: 'Haz clic <a href="{{link}}">aquí</a> para activar tu cuenta',
    pt: 'Clique <a href="{{link}}">aqui</a> para ativar sua conta',
    de: 'Klicken Sie <a href="{{link}}">hier</a>, um Ihr Konto zu aktivieren',
    it: 'Fai clic <a href="{{link}}">qui</a> per attivare il tuo account',
    ja: '<a href="{{link}}">こちら</a>をクリックしてアカウントを有効化してください',
    ko: '계정을 활성화하려면 <a href="{{link}}">여기</a>를 클릭하세요',
    ar: 'انقر <a href="{{link}}">هنا</a> لتفعيل حسابك',
    tr: 'Hesabınızı etkinleştirmek için <a href="{{link}}">buraya</a> tıklayın',
    vi: 'Nhấp <a href="{{link}}">vào đây</a> để kích hoạt tài khoản của bạn',
    bn: 'আপনার অ্যাকাউন্ট সক্রিয় করতে <a href="{{link}}">এখানে</a> ক্লিক করুন',
    ka_ge: 'თქვენი ანგარიშის გასააქტიურებლად დააჭირეთ <a href="{{link}}">აქ</a>',
  },
  email_awaiting_approval_subject: {
    en: 'Your registration is awaiting approval',
    he: 'ההרשמה שלכם ממתינה לאישור',
    ru: 'Ваша регистрация ожидает одобрения',
    zh: '您的注册正在等待审批',
    fr: 'Votre inscription est en attente de validation',
    es: 'Tu registro está pendiente de aprobación',
    pt: 'Seu cadastro está aguardando aprovação',
    de: 'Ihre Registrierung wartet auf Genehmigung',
    it: 'La tua registrazione è in attesa di approvazione',
    ja: 'ご登録は承認待ちです',
    ko: '회원가입이 승인 대기 중입니다',
    ar: 'تسجيلك بانتظار الموافقة',
    tr: 'Kaydınız onay bekliyor',
    vi: 'Đăng ký của bạn đang chờ phê duyệt',
    bn: 'আপনার নিবন্ধন অনুমোদনের অপেক্ষায় আছে',
    ka_ge: 'თქვენი რეგისტრაცია ელოდება დამტკიცებას',
  },
  email_awaiting_approval_body: {
    en: 'Thanks for registering. Your account has been created and is waiting for an administrator to approve it. There is nothing you need to do — you will be able to sign in once it has been approved.',
    he: 'תודה שנרשמתם. החשבון שלכם נוצר וממתין לאישור של מנהל מערכת. אין צורך לבצע פעולה נוספת — תוכלו להתחבר לאחר קבלת האישור.',
    ru: 'Спасибо за регистрацию. Ваш аккаунт создан и ожидает одобрения администратора. Вам не нужно ничего делать — вы сможете войти, как только заявку одобрят.',
    zh: '感谢您的注册。您的账户已创建，正在等待管理员审批。您无需进行任何操作——审批通过后即可登录。',
    fr: "Merci de vous être inscrit. Votre compte a été créé et attend la validation d'un administrateur. Vous n'avez rien à faire — vous pourrez vous connecter une fois la validation effectuée.",
    es: 'Gracias por registrarte. Tu cuenta ha sido creada y está a la espera de que un administrador la apruebe. No tienes que hacer nada más: podrás iniciar sesión en cuanto se apruebe.',
    pt: 'Obrigado por se cadastrar. Sua conta foi criada e está aguardando a aprovação de um administrador. Você não precisa fazer nada — poderá entrar assim que a aprovação acontecer.',
    de: 'Danke für Ihre Registrierung. Ihr Konto wurde erstellt und wartet auf die Genehmigung durch einen Administrator. Sie müssen nichts weiter tun — Sie können sich anmelden, sobald es genehmigt wurde.',
    it: 'Grazie per esserti registrato. Il tuo account è stato creato e attende l\'approvazione di un amministratore. Non devi fare nulla — potrai accedere non appena sarà approvato.',
    ja: 'ご登録ありがとうございます。アカウントは作成され、管理者の承認待ちです。特に行う操作はありません。承認され次第サインインできるようになります。',
    ko: '가입해 주셔서 감사합니다. 계정이 생성되었으며 관리자의 승인을 기다리고 있습니다. 별도로 하실 일은 없으며, 승인되면 로그인하실 수 있습니다.',
    ar: 'شكرًا لتسجيلك. تم إنشاء حسابك وهو بانتظار موافقة أحد المسؤولين. لا حاجة لاتخاذ أي إجراء — ستتمكن من تسجيل الدخول بمجرد الموافقة عليه.',
    tr: 'Kaydınız için teşekkürler. Hesabınız oluşturuldu ve bir yöneticinin onayını bekliyor. Yapmanız gereken bir şey yok — onaylandığında giriş yapabileceksiniz.',
    vi: 'Cảm ơn bạn đã đăng ký. Tài khoản của bạn đã được tạo và đang chờ quản trị viên phê duyệt. Bạn không cần làm gì thêm — bạn sẽ có thể đăng nhập ngay khi được phê duyệt.',
    bn: 'নিবন্ধনের জন্য ধন্যবাদ। আপনার অ্যাকাউন্ট তৈরি হয়েছে এবং একজন প্রশাসকের অনুমোদনের অপেক্ষায় আছে। আপনাকে আর কিছু করতে হবে না — অনুমোদনের পরেই আপনি সাইন ইন করতে পারবেন।',
    ka_ge: 'მადლობა რეგისტრაციისთვის. თქვენი ანგარიში შეიქმნა და ელოდება ადმინისტრატორის დამტკიცებას. თქვენგან არაფერია საჭირო — შესვლა შეძლებთ დამტკიცებისთანავე.',
  },
  email_reset_password_subject: {
    en: 'Reset your password',
    he: 'איפוס הסיסמה שלכם',
    ru: 'Сброс пароля',
    zh: '重置您的密码',
    fr: 'Réinitialisez votre mot de passe',
    es: 'Restablece tu contraseña',
    pt: 'Redefina sua senha',
    de: 'Setzen Sie Ihr Passwort zurück',
    it: 'Reimposta la tua password',
    ja: 'パスワードをリセットしてください',
    ko: '비밀번호를 재설정하세요',
    ar: 'إعادة تعيين كلمة المرور',
    tr: 'Şifrenizi sıfırlayın',
    vi: 'Đặt lại mật khẩu của bạn',
    bn: 'আপনার পাসওয়ার্ড রিসেট করুন',
    ka_ge: 'პაროლის აღდგენა',
  },
  email_reset_password_body: {
    en: 'You have requested to reset your password. <br />Click <a href="{{link}}">here</a> to reset your password<br />The link will expire in 20 minutes',
    he: 'ביקשתם לאפס את הסיסמה שלכם. <br />לחצו <a href="{{link}}">כאן</a> כדי לאפס אותה<br />הקישור יפוג בעוד 20 דקות',
    ru: 'Вы запросили сброс пароля. <br />Нажмите <a href="{{link}}">здесь</a>, чтобы сбросить пароль<br />Ссылка действительна 20 минут',
    zh: '您已请求重置密码。<br />点击<a href="{{link}}">此处</a>重置密码<br />链接将在 20 分钟后失效',
    fr: "Vous avez demandé la réinitialisation de votre mot de passe. <br />Cliquez <a href=\"{{link}}\">ici</a> pour le réinitialiser<br />Le lien expire dans 20 minutes",
    es: 'Has solicitado restablecer tu contraseña. <br />Haz clic <a href="{{link}}">aquí</a> para restablecerla<br />El enlace caduca en 20 minutos',
    pt: 'Você solicitou a redefinição da sua senha. <br />Clique <a href="{{link}}">aqui</a> para redefini-la<br />O link expira em 20 minutos',
    de: 'Sie haben eine Passwortzurücksetzung angefordert. <br />Klicken Sie <a href="{{link}}">hier</a>, um es zurückzusetzen<br />Der Link läuft in 20 Minuten ab',
    it: 'Hai richiesto di reimpostare la password. <br />Fai clic <a href="{{link}}">qui</a> per reimpostarla<br />Il link scade tra 20 minuti',
    ja: 'パスワードのリセットをリクエストされました。<br /><a href="{{link}}">こちら</a>をクリックしてパスワードをリセットしてください<br />リンクの有効期限は20分です',
    ko: '비밀번호 재설정을 요청하셨습니다. <br />비밀번호를 재설정하려면 <a href="{{link}}">여기</a>를 클릭하세요<br />링크는 20분 후에 만료됩니다',
    ar: 'لقد طلبت إعادة تعيين كلمة المرور. <br />انقر <a href="{{link}}">هنا</a> لإعادة تعيينها<br />ستنتهي صلاحية الرابط خلال 20 دقيقة',
    tr: 'Şifrenizi sıfırlamayı talep ettiniz. <br />Sıfırlamak için <a href="{{link}}">buraya</a> tıklayın<br />Bağlantının süresi 20 dakika içinde dolacak',
    vi: 'Bạn đã yêu cầu đặt lại mật khẩu. <br />Nhấp <a href="{{link}}">vào đây</a> để đặt lại mật khẩu<br />Liên kết sẽ hết hạn sau 20 phút',
    bn: 'আপনি পাসওয়ার্ড রিসেট করার অনুরোধ করেছেন। <br />পাসওয়ার্ড রিসেট করতে <a href="{{link}}">এখানে</a> ক্লিক করুন<br />লিঙ্কটি ২০ মিনিটের মধ্যে মেয়াদোত্তীর্ণ হবে',
    ka_ge: 'თქვენ მოითხოვეთ პაროლის აღდგენა. <br />პაროლის აღსადგენად დააჭირეთ <a href="{{link}}">აქ</a><br />ბმულის მოქმედების ვადა 20 წუთშია',
  },
  email_confirm_identity_subject: {
    en: 'Confirm your email address',
    he: 'אשרו את כתובת האימייל שלכם',
    ru: 'Подтвердите адрес электронной почты',
    zh: '确认您的电子邮件地址',
    fr: 'Confirmez votre adresse e-mail',
    es: 'Confirma tu dirección de correo electrónico',
    pt: 'Confirme seu endereço de e-mail',
    de: 'Bestätigen Sie Ihre E-Mail-Adresse',
    it: 'Conferma il tuo indirizzo email',
    ja: 'メールアドレスを確認してください',
    ko: '이메일 주소를 확인하세요',
    ar: 'أكّد عنوان بريدك الإلكتروني',
    tr: 'E-posta adresinizi onaylayın',
    vi: 'Xác nhận địa chỉ email của bạn',
    bn: 'আপনার ইমেইল ঠিকানা নিশ্চিত করুন',
    ka_ge: 'დაადასტურეთ თქვენი ელფოსტის მისამართი',
  },
  email_confirm_identity_body: {
    en: 'Someone added this address as a sign-in method for a Content Factory account. Click <a href="{{link}}">here</a> to confirm it while signed in to that account.<br />The link will expire in {{minutes}} minutes. If this was not you, ignore this email — nothing was added to any account and this address stays free.',
    he: 'מישהו הוסיף כתובת זו כאמצעי כניסה לחשבון Content Factory. לחצו <a href="{{link}}">כאן</a> כדי לאשר זאת בזמן שאתם מחוברים לאותו חשבון.<br />הקישור יפוג בעוד {{minutes}} דקות. אם זה לא הייתם אתם, התעלמו מהודעה זו — שום דבר לא נוסף לאף חשבון וכתובת זו נותרת פנויה.',
    ru: 'Кто-то добавил этот адрес как способ входа в аккаунт Content Factory. Нажмите <a href="{{link}}">здесь</a>, чтобы подтвердить это, находясь в системе под этим аккаунтом.<br />Ссылка действительна {{minutes}} минут. Если это были не вы, просто проигнорируйте это письмо — в аккаунт ничего не добавлено, и этот адрес остаётся свободным.',
    zh: '有人将此地址添加为 Content Factory 账户的登录方式。请在登录该账户的情况下点击<a href="{{link}}">此处</a>进行确认。<br />链接将在 {{minutes}} 分钟后失效。如果这不是您本人操作，请忽略此邮件——未向任何账户添加任何内容，该地址仍可自由使用。',
    fr: "Quelqu'un a ajouté cette adresse comme méthode de connexion pour un compte Content Factory. Cliquez <a href=\"{{link}}\">ici</a> pour confirmer, en étant connecté à ce compte.<br />Le lien expire dans {{minutes}} minutes. Si ce n'était pas vous, ignorez cet e-mail : rien n'a été ajouté à un compte et cette adresse reste libre.",
    es: 'Alguien añadió esta dirección como método de inicio de sesión para una cuenta de Content Factory. Haz clic <a href="{{link}}">aquí</a> para confirmarlo mientras tienes la sesión iniciada en esa cuenta.<br />El enlace caduca en {{minutes}} minutos. Si no fuiste tú, ignora este correo: no se añadió nada a ninguna cuenta y esta dirección sigue libre.',
    pt: 'Alguém adicionou este endereço como método de login de uma conta Content Factory. Clique <a href="{{link}}">aqui</a> para confirmar enquanto estiver conectado a essa conta.<br />O link expira em {{minutes}} minutos. Se não foi você, ignore este e-mail — nada foi adicionado a nenhuma conta e este endereço continua livre.',
    de: 'Jemand hat diese Adresse als Anmeldemethode für ein Content-Factory-Konto hinzugefügt. Klicken Sie <a href="{{link}}">hier</a>, um dies zu bestätigen, während Sie in diesem Konto angemeldet sind.<br />Der Link läuft in {{minutes}} Minuten ab. Wenn Sie das nicht waren, ignorieren Sie diese E-Mail — es wurde nichts zu einem Konto hinzugefügt, und diese Adresse bleibt frei.',
    it: "Qualcuno ha aggiunto questo indirizzo come metodo di accesso per un account Content Factory. Fai clic <a href=\"{{link}}\">qui</a> per confermarlo mentre sei connesso a quell'account.<br />Il link scade tra {{minutes}} minuti. Se non sei stato tu, ignora questa email: non è stato aggiunto nulla a nessun account e questo indirizzo resta libero.",
    ja: 'Content Factoryアカウントのサインイン方法として、このアドレスが追加されました。そのアカウントにサインインした状態で<a href="{{link}}">こちら</a>をクリックして確認してください。<br />リンクの有効期限は{{minutes}}分です。心当たりがない場合は、このメールを無視してください。どのアカウントにも何も追加されておらず、このアドレスは引き続き未使用のままです。',
    ko: '누군가 이 주소를 Content Factory 계정의 로그인 방법으로 추가했습니다. 해당 계정에 로그인한 상태에서 <a href="{{link}}">여기</a>를 클릭하여 확인하세요.<br />링크는 {{minutes}}분 후에 만료됩니다. 본인이 아니라면 이 이메일을 무시하세요. 어떤 계정에도 아무것도 추가되지 않았으며 이 주소는 계속 사용 가능합니다.',
    ar: 'أضاف شخص ما هذا العنوان كطريقة لتسجيل الدخول إلى حساب Content Factory. انقر <a href="{{link}}">هنا</a> للتأكيد أثناء تسجيل الدخول إلى ذلك الحساب.<br />ستنتهي صلاحية الرابط خلال {{minutes}} دقيقة. إذا لم يكن هذا أنت، فتجاهل هذه الرسالة — لم تتم إضافة أي شيء إلى أي حساب، ويبقى هذا العنوان متاحًا.',
    tr: 'Biri bu adresi bir Content Factory hesabı için giriş yöntemi olarak ekledi. O hesapta oturum açıkken onaylamak için <a href="{{link}}">buraya</a> tıklayın.<br />Bağlantının süresi {{minutes}} dakika içinde dolacak. Bu siz değilseniz bu e-postayı yok sayın — hiçbir hesaba bir şey eklenmedi ve bu adres boşta kalmaya devam ediyor.',
    vi: 'Ai đó đã thêm địa chỉ này làm phương thức đăng nhập cho một tài khoản Content Factory. Nhấp <a href="{{link}}">vào đây</a> để xác nhận trong khi đang đăng nhập vào tài khoản đó.<br />Liên kết sẽ hết hạn sau {{minutes}} phút. Nếu không phải bạn, hãy bỏ qua email này — không có gì được thêm vào tài khoản nào và địa chỉ này vẫn còn trống.',
    bn: 'কেউ এই ঠিকানাটি একটি Content Factory অ্যাকাউন্টের সাইন-ইন পদ্ধতি হিসেবে যোগ করেছে। সেই অ্যাকাউন্টে সাইন ইন থাকা অবস্থায় এটি নিশ্চিত করতে <a href="{{link}}">এখানে</a> ক্লিক করুন।<br />লিঙ্কটি {{minutes}} মিনিটের মধ্যে মেয়াদোত্তীর্ণ হবে। এটি যদি আপনি না হয়ে থাকেন, তাহলে এই ইমেইলটি উপেক্ষা করুন — কোনো অ্যাকাউন্টে কিছু যোগ করা হয়নি এবং এই ঠিকানাটি এখনও উন্মুক্ত রয়েছে।',
    ka_ge: 'ვიღაცამ დაამატა ეს მისამართი Content Factory ანგარიშზე შესვლის მეთოდად. დასადასტურებლად, ამ ანგარიშზე შესული მდგომარეობით, დააჭირეთ <a href="{{link}}">აქ</a>.<br />ბმულის მოქმედების ვადა {{minutes}} წუთშია. თუ ეს თქვენ არ ყოფილხართ, უბრალოდ დააიგნორეთ ეს წერილი — არაფერი დამატებულა არცერთ ანგარიშზე და ეს მისამართი კვლავ თავისუფალია.',
  },
  email_login_changed_subject: {
    en: 'Your Content Factory login was changed',
    he: 'פרטי הכניסה שלכם ל-Content Factory השתנו',
    ru: 'Логин для входа в Content Factory изменён',
    zh: '您的 Content Factory 登录方式已更改',
    fr: 'Les identifiants de connexion de votre compte Content Factory ont changé',
    es: 'Se cambió el inicio de sesión de tu cuenta de Content Factory',
    pt: 'O login da sua conta Content Factory foi alterado',
    de: 'Ihr Content-Factory-Login wurde geändert',
    it: "L'accesso al tuo account Content Factory è cambiato",
    ja: 'Content Factoryのログイン情報が変更されました',
    ko: 'Content Factory 로그인 정보가 변경되었습니다',
    ar: 'تم تغيير بيانات تسجيل الدخول لحساب Content Factory الخاص بك',
    tr: 'Content Factory giriş bilgileriniz değiştirildi',
    vi: 'Thông tin đăng nhập Content Factory của bạn đã thay đổi',
    bn: 'আপনার Content Factory লগইন পরিবর্তন করা হয়েছে',
    ka_ge: 'თქვენი Content Factory ანგარიშზე შესვლის მონაცემები შეიცვალა',
  },
  email_login_changed_body: {
    en: 'An administrator changed the login for your Content Factory account. You can now sign in using {{email}}. Your subscription and plan were not changed by this switch — if you intended to cancel a subscription, please do that separately from your billing settings.',
    he: 'מנהל מערכת שינה את פרטי הכניסה לחשבון Content Factory שלכם. כעת תוכלו להתחבר באמצעות {{email}}. המנוי והתוכנית שלכם לא השתנו כתוצאה מהחלפה זו — אם רציתם לבטל מנוי, בצעו זאת בנפרד בהגדרות החיוב.',
    ru: 'Администратор изменил логин для вашего аккаунта Content Factory. Теперь вы можете входить, используя {{email}}. Ваша подписка и тариф при этой замене не изменились — если вы хотели отменить подписку, сделайте это отдельно в настройках оплаты.',
    zh: '管理员已更改您 Content Factory 账户的登录方式。您现在可以使用 {{email}} 登录。此次更改不会影响您的订阅和套餐——如果您想取消订阅，请在账单设置中单独操作。',
    fr: "Un administrateur a modifié les identifiants de connexion de votre compte Content Factory. Vous pouvez désormais vous connecter avec {{email}}. Votre abonnement et votre offre n'ont pas changé ; si vous vouliez résilier un abonnement, faites-le séparément dans les paramètres de facturation.",
    es: 'Un administrador cambió el inicio de sesión de tu cuenta de Content Factory. Ahora puedes iniciar sesión con {{email}}. Tu suscripción y plan no se vieron afectados por este cambio; si querías cancelar una suscripción, hazlo por separado en la configuración de facturación.',
    pt: 'Um administrador alterou o login da sua conta Content Factory. Agora você pode entrar usando {{email}}. Sua assinatura e plano não foram alterados por essa troca — se pretendia cancelar uma assinatura, faça isso separadamente nas configurações de cobrança.',
    de: 'Ein Administrator hat den Login für Ihr Content-Factory-Konto geändert. Sie können sich jetzt mit {{email}} anmelden. Ihr Abonnement und Tarif wurden durch diesen Wechsel nicht geändert — falls Sie ein Abonnement kündigen wollten, tun Sie dies separat in den Abrechnungseinstellungen.',
    it: "Un amministratore ha cambiato l'accesso al tuo account Content Factory. Ora puoi accedere usando {{email}}. Il tuo abbonamento e piano non sono cambiati con questa modifica — se volevi annullare un abbonamento, fallo separatamente nelle impostazioni di fatturazione.",
    ja: '管理者があなたのContent Factoryアカウントのログイン情報を変更しました。今後は{{email}}でサインインできます。この変更によりサブスクリプションやプランは変更されていません。サブスクリプションの解約をご希望の場合は、請求設定から別途行ってください。',
    ko: '관리자가 귀하의 Content Factory 계정 로그인 정보를 변경했습니다. 이제 {{email}}(으)로 로그인할 수 있습니다. 이번 변경으로 구독 및 요금제는 변경되지 않았습니다. 구독을 취소하려면 결제 설정에서 별도로 진행해 주세요.',
    ar: 'قام أحد المسؤولين بتغيير بيانات تسجيل الدخول لحساب Content Factory الخاص بك. يمكنك الآن تسجيل الدخول باستخدام {{email}}. لم يتغيّر اشتراكك وخطتك بسبب هذا التبديل — إذا كنت تريد إلغاء اشتراك، فقم بذلك بشكل منفصل من إعدادات الفوترة.',
    tr: 'Bir yönetici Content Factory hesabınızın giriş bilgilerini değiştirdi. Artık {{email}} ile giriş yapabilirsiniz. Bu değişiklikle aboneliğiniz ve planınız değişmedi — bir aboneliği iptal etmek istiyorsanız bunu fatura ayarlarından ayrıca yapın.',
    vi: 'Quản trị viên đã thay đổi thông tin đăng nhập cho tài khoản Content Factory của bạn. Giờ đây bạn có thể đăng nhập bằng {{email}}. Gói đăng ký và kế hoạch của bạn không bị thay đổi bởi việc này — nếu bạn muốn hủy đăng ký, vui lòng thực hiện riêng trong phần cài đặt thanh toán.',
    bn: 'একজন প্রশাসক আপনার Content Factory অ্যাকাউন্টের লগইন পরিবর্তন করেছেন। এখন আপনি {{email}} ব্যবহার করে সাইন ইন করতে পারবেন। এই পরিবর্তনে আপনার সাবস্ক্রিপশন ও প্ল্যান অপরিবর্তিত রয়েছে — যদি আপনি সাবস্ক্রিপশন বাতিল করতে চান, তবে তা বিলিং সেটিংস থেকে আলাদাভাবে করুন।',
    ka_ge: 'ადმინისტრატორმა შეცვალა თქვენი Content Factory ანგარიშზე შესვლის მონაცემები. ახლა შეგიძლიათ შეხვიდეთ {{email}}-ის გამოყენებით. თქვენი გამოწერა და გეგმა ამ ცვლილებამ არ შეცვალა — თუ გსურთ გამოწერის გაუქმება, გააკეთეთ ეს ცალკე, ბილინგის პარამეტრებში.',
  },
  email_footer_notification_preferences: {
    en: 'You can change your notification preferences in your <a href="{{link}}">account settings.</a>',
    he: 'תוכלו לשנות את העדפות ההתראות ב<a href="{{link}}">הגדרות החשבון.</a>',
    ru: 'Изменить настройки уведомлений можно в <a href="{{link}}">настройках аккаунта.</a>',
    zh: '您可以在<a href="{{link}}">账户设置</a>中更改通知偏好。',
    fr: 'Vous pouvez modifier vos préférences de notification dans les <a href="{{link}}">paramètres de votre compte.</a>',
    es: 'Puedes cambiar tus preferencias de notificación en la <a href="{{link}}">configuración de tu cuenta.</a>',
    pt: 'Você pode alterar suas preferências de notificação nas <a href="{{link}}">configurações da conta.</a>',
    de: 'Sie können Ihre Benachrichtigungseinstellungen in Ihren <a href="{{link}}">Kontoeinstellungen.</a>',
    it: 'Puoi modificare le preferenze di notifica nelle <a href="{{link}}">impostazioni dell\'account.</a>',
    ja: '通知設定は<a href="{{link}}">アカウント設定</a>で変更できます。',
    ko: '<a href="{{link}}">계정 설정</a>에서 알림 환경설정을 변경할 수 있습니다.',
    ar: 'يمكنك تغيير تفضيلات الإشعارات في <a href="{{link}}">إعدادات حسابك.</a>',
    tr: 'Bildirim tercihlerinizi <a href="{{link}}">hesap ayarlarınızdan</a> değiştirebilirsiniz.',
    vi: 'Bạn có thể thay đổi tùy chọn thông báo trong <a href="{{link}}">cài đặt tài khoản.</a>',
    bn: 'আপনি আপনার বিজ্ঞপ্তি পছন্দসমূহ <a href="{{link}}">অ্যাকাউন্ট সেটিংসে</a> পরিবর্তন করতে পারেন।',
    ka_ge: 'შეტყობინებების პარამეტრების შეცვლა შეგიძლიათ <a href="{{link}}">ანგარიშის პარამეტრებში.</a>',
  },
} satisfies Record<string, BackendStringEntry>;

export type BackendStringKey = keyof typeof CATALOG;

function interpolate(template: string, params?: BackendStringParams): string {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, token) =>
    Object.prototype.hasOwnProperty.call(params, token)
      ? String(params[token])
      : match
  );
}

/**
 * Falls back to English whenever a key has no entry for the requested
 * locale — none currently do, every key above lists all sixteen, but the
 * fallback stays so a future partial key degrades instead of breaking.
 */
export function translateBackendString(
  key: BackendStringKey,
  locale: BackendLocale,
  params?: BackendStringParams
): string {
  const entry: Partial<BackendStringEntry> = CATALOG[key];
  const template = entry[locale] ?? entry[BACKEND_FALLBACK_LOCALE]!;
  return interpolate(template, params);
}
