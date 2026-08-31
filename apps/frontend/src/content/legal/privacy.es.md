---
title: Aviso de privacidad
updated: 2026-08-27
language: es
---

# Aviso de privacidad

Esta página dice qué datos personales recoge Content Factory
(factory.aidevteam.ru), para qué los necesita, quién más los ve y cómo
eliminarlos. Es breve porque no hay muchos datos.

## 1. Quién es responsable y cómo contactarlo

El operador de los datos personales es OOO «МЕГАКАМПУС» (LLC MEGAKAMPUS),
OGRN 1107746107204, INN 7719743262, con domicilio en 105318, Moscú,
ul. Izmaylovskiy val 2, planta 3, local I, sala 12G, Rusia. El operador decide
por qué y cómo se tratan los datos personales en Content Factory en
factory.aidevteam.ru y responde de ese tratamiento.

El canal más rápido es el bot de Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot); ese mismo bot es el soporte. Una
solicitud formal sobre tus derechos se envía a info@megacampus.com o por correo
postal a la dirección anterior. Una solicitud sobre si tus datos se tratan se
responde en un plazo de 10 días hábiles desde su recepción; ese plazo puede
ampliarse como máximo 5 días hábiles, y te diremos por qué.

## 2. Qué se recoge

### 2.1 Registro y cuenta

Cuando crea una cuenta se guarda lo siguiente:

- su dirección de correo electrónico;
- su contraseña — no la contraseña en sí, sino un hash bcrypt de ella. La
  contraseña no se puede recuperar del hash y no la conocemos;
- cómo inicia sesión: con contraseña o con un servicio externo como Telegram,
  junto con el identificador que ese servicio emite;
- la dirección IP y la cadena User-Agent del navegador vistas en el momento del
  registro;
- el nombre del espacio de trabajo, si indicó uno;
- una zona horaria;
- la anotación de que aceptó el boletín, y cuándo, si marcó la casilla.

Más adelante puede añadir nombre, apellidos, una descripción breve y una imagen
de perfil. Nada de eso es obligatorio.

El registro está abierto, pero una cuenta nueva no funciona hasta que un
administrador la aprueba. Antes de la aprobación la cuenta existe y no puede
hacer nada: no se emite ninguna sesión, no se envía el correo de activación y
toda petición a la API se rechaza.

### 2.2 Uso del servicio

Mientras usa el servicio, la base de datos guarda lo que usted pone en ella:
textos de publicaciones, archivos subidos, calendarios de publicación,
comentarios, ajustes. Si conecta un canal de una red social, también se guarda
el token de acceso que esa red emitió: sin él el servicio no puede publicar en
su nombre. Las claves de proveedores de IA, si introduce alguna, se guardan
cifradas.

Hay un registro aparte del uso de IA. Anota solo qué operación se admitió: la
organización, el modo, el nombre de la operación, el proveedor, el modelo y el
resultado de la admisión. Ahí no entran ni prompts, ni textos de publicaciones,
ni respuestas del modelo.

Para distinguir su texto de un texto escrito por una máquina, el servicio lo
compara con textos de otros autores que trabajan en el servicio. Lo hace una
tarea del servidor: lee esos textos, calcula números a partir de ellos y hacia
fuera entrega solo números — una distribución de puntuaciones y dos límites.
Ninguna frase ajena llega a su espacio de trabajo: ni a la pantalla, ni a una
instrucción del modelo, ni a un registro. Sus propios textos participan en la
misma comparación para otros autores.

Cuando el servicio propone un borrador y usted envía su propia versión, se
guarda el par: lo que propuso el modelo y lo que usted envió. Sirve para que la
comprobación de parecido aprenda a distinguir el texto de máquina del suyo. El
par vive mientras exista el avatar para el que se recogió: si borra el avatar,
las correcciones se borran con él.

### 2.3 Páginas públicas y demostración

Las páginas públicas y la demostración del producto cuentan cuántas veces ocurre
algo. Se envían exactamente cinco campos:

- el nombre del evento — uno de cuatro: página de inicio vista, demostración
  iniciada, demostración terminada, registro iniciado;
- el idioma de la página — `ru` o `en`;
- un rango de anchura de ventana — una de cuatro palabras, nunca el tamaño
  real;
- una versión de la interfaz;
- un paso de la demostración.

Nada más. Ni dirección IP, ni User-Agent, ni página de procedencia, ni cookie,
ni identificador de visitante, ni dirección de correo. Todo ello se suma en
contadores diarios: una fila por día y conjunto de valores, con un número
dentro. Nada en esos datos permite distinguir a un visitante de otro.

Otros dos eventos — un registro completado y la activación de un espacio de
trabajo — los anota el propio servidor. Guarda un recibo: el nombre del evento y
el resultado de una transformación criptográfica irreversible. El recibo existe
para que el mismo evento no se cuente dos veces. No lleva dirección, ni nombre,
ni IP.

Para que nadie inunde los contadores, hay un límite de frecuencia. Cuenta las
peticiones contra una clave temporal derivada de la dirección IP mediante una
transformación irreversible con una clave aleatoria. Esa clave vive un minuto y
solo en la memoria del proceso en ejecución. La dirección IP en sí no se anota
nunca.

### 2.4 Cookies

Las cookies que pone este servicio:

- `auth` — su sesión. Aparece después de iniciar sesión y dura hasta un año. Sin
  ella el inicio de sesión no funciona;
- `showorg` — qué espacio de trabajo abrir. Aparece cuando hay más de uno;
- `org` — una invitación al espacio de trabajo de otra persona. Vive 15 minutos;
- `oauth_state` — una comprobación breve de que un inicio de sesión a través de
  un servicio externo volvió al navegador que lo empezó. Vive 5 minutos;
- `i18next` — el idioma de interfaz que eligió.

No hay cookies publicitarias. No hay cookies de analítica de terceros. Ninguna
de las cookies anteriores le sigue a otros sitios.

### 2.5 Informes de error

Cuando algo se rompe, el servicio envía un informe de error a su propio
recolector, que funciona en el mismo host. El informe contiene un identificador
de evento, la hora, un nivel, el entorno, la versión de compilación, el nombre
del servicio, el tipo de error y los marcos de pila: la ruta del archivo
relativa a la raíz del repositorio, el nombre de la función, la línea y la
columna.

Ni usuario, ni petición, ni cabeceras, ni cookies, ni dirección IP, ni
User-Agent, ni nada del texto que estaba escribiendo. El evento se reconstruye a
partir de una lista permitida de campos en lugar de reenviarse tal como llegó.

### 2.6 Qué no tiene este producto

Vale la pena decirlo con claridad, porque es poco habitual. El producto no lleva
ninguna analítica de producto de terceros. PostHog, Plausible, Google Tag
Manager, dub, datafa.st, el píxel de Facebook, el Sentry alojado y el widget de
chat Chatbase se eliminaron junto con sus dependencias, y devolver cualquiera de
ellos hace fallar una comprobación automática. Las páginas en vivo no cargan
ningún script externo. Las fuentes se sirven desde nuestro propio servidor, no
desde una CDN de fuentes.

No hay elaboración de perfiles. No hay decisiones automatizadas sobre usted
basadas en sus datos. Sus datos no se venden.

## 3. Para qué se usan estos datos

- Dirección y contraseña — para que pueda iniciar sesión y para que podamos
  distinguir su cuenta de la de otra persona.
- Dirección IP y User-Agent en el registro — para hacer frente al abuso del
  registro y a los intentos de adivinar contraseñas.
- Contenido del espacio de trabajo — para que el servicio haga aquello para lo
  que usted vino.
- Tokens de los canales conectados — para publicar las publicaciones donde usted
  indicó.
- Contadores de las páginas públicas — para saber si el producto funciona, sin
  vigilar a las personas.
- Informes de error — para arreglar lo que se rompe.
- Dirección para el boletín — solo si marcó la casilla.

Casi todo lo anterior se trata porque hace falta para entregar lo que usted pidió
al crear la cuenta. El boletín es distinto: funciona con su consentimiento, y
puede retirar ese consentimiento en cualquier momento.

## 4. Quién más recibe datos

La lista completa de destinatarios, y qué llega a cada uno, está en un documento
aparte, «Destinatarios de los datos». En resumen:

- el servicio de entrega de correo Resend recibe la dirección del destinatario,
  el asunto y el cuerpo de un correo de servicio: activación de cuenta,
  restablecimiento de contraseña, confirmación de dirección. Ningún contenido de
  publicaciones y ningún token de plataforma;
- el sistema de boletines Listmonk funciona en nuestro propio host y recibe su
  dirección solo tras un consentimiento explícito. No sale del host;
- nuestro propio recolector de errores, en nuestro propio host, recibe lo que
  describe la sección 2.5;
- Telegram interviene si inicia sesión a través de Telegram;
- OpenAI, OpenRouter y Tavily reciben prompts, textos de publicaciones y
  consultas de búsqueda, pero solo si un espacio de trabajo configura la IA por
  su cuenta. Las claves de una organización nunca se usan para otra;
- las API de las redes sociales reciben el contenido de las publicaciones y los
  archivos, cuando usted ha conectado un canal y ha pedido publicar;
- una dirección que usted elija recibe una publicación entera, si configura un
  webhook que apunte a ella.

Los datos van a una autoridad pública solo donde la ley lo exige.

No vendemos datos y no los entregamos a anunciantes.

## 5. Dónde se tratan los datos

El servidor está en los Países Bajos. La base de datos, los archivos, el sistema
de boletines y el recolector de errores funcionan todos en él.

Parte del correo de servicio sale a través de Resend, una empresa de Estados
Unidos, que envía el correo de este producto desde la región `eu-west-1`. Eso
significa que su dirección de correo y el texto de un mensaje de servicio salen
de los Países Bajos. Nada más lo hace, salvo que usted mismo conecte IA, un
canal de red social o un webhook.

## 6. Cuánto tiempo se guardan los datos

- Datos de la cuenta y contenido del espacio de trabajo — mientras la cuenta
  exista.
- Los pares de borrador propuesto y texto enviado — mientras exista el avatar
  para el que se recogieron. Borrar el avatar los elimina de inmediato.
- Recibos de registro y el registro de uso de IA — 90 días. Después una tarea
  diaria los borra.
- Contadores diarios de las páginas públicas — se guardan indefinidamente. No
  contienen nada relativo a una persona: una fecha, un nombre de evento, un
  idioma, un rango de anchura, una versión de la interfaz, un paso y un número.
- Informes de error — durante el periodo configurado en el recolector.
- Las copias de seguridad de la base de datos tienen su propio calendario. Los
  datos borrados desaparecen de ellas a medida que las copias rotan.

## 7. Sus derechos

Usted puede:

- preguntar si se tratan sus datos y qué se guarda;
- obtener una copia de sus datos;
- hacer que se corrijan datos inexactos;
- pedir la eliminación;
- retirar su consentimiento al boletín;
- oponerse al tratamiento;
- reclamar ante la autoridad de protección de datos de su país.

Para ejercer cualquiera de estos derechos, escriba a [@content_factory_adtbot](https://t.me/content_factory_adtbot). Puede
que le pidamos demostrar que el mensaje viene del titular de la cuenta; de lo
contrario entregamos los datos de otra persona a cualquiera que conozca su
dirección.

## 8. Cómo borrar su cuenta y sus datos

Todavía no hay un botón de «eliminar cuenta» en la interfaz. Escriba al bot de
Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot) e indique
la dirección de correo electrónico que usa la cuenta. Podemos pedirle una prueba
adicional de identidad. Después borraremos la cuenta y su contenido.

Lo que puede hacer usted mismo, sin pedírnoslo:

- desconectar un canal de red social. La publicación en él se detiene de
  inmediato y el canal desaparece de la interfaz. El registro queda marcado como
  borrado, pero permanece en la base de datos hasta que se eliminan los datos de
  la cuenta;
- borrar publicaciones, archivos, firmas, conjuntos y webhooks;
- borrar cualquier clave de proveedor de IA que haya introducido;
- darse de baja del boletín con el enlace del propio correo.

## 9. Edad

El servicio está pensado para adultos. No recogemos datos de menores a
sabiendas. Si resulta que una cuenta la creó un menor, la borraremos:
escríbanos.

## 10. Cómo se protegen los datos

- Las contraseñas se guardan solo como hashes bcrypt.
- Una contraseña de inicio de sesión debe tener al menos 12 caracteres.
- Las claves de proveedores de IA y la clave de API de la organización se
  guardan cifradas.
- La conexión va por HTTPS, la cookie de sesión está marcada como `secure` y
  `httpOnly`, y su alcance se limita a la dirección exacta del servicio.
- El registro, el inicio de sesión, el restablecimiento de contraseña y el
  reenvío del correo de activación tienen límite de frecuencia.
- El registro necesita la aprobación de un administrador, así que la cuenta de
  un desconocido no aparece sola en el servidor.

La seguridad perfecta no existe y no la prometemos. Prometemos arreglar aquello
de lo que nos enteramos.

## 11. Código abierto

Content Factory se distribuye bajo la licencia AGPL-3.0. Eso significa que
debemos dar el código fuente del servicio en ejecución a cualquiera que lo use,
y lo hacemos: el sitio lleva un enlace «Código fuente» y `/api/public/source`
sirve una página con un archivo de exactamente la versión que está funcionando
ahora. El archivo no contiene ficheros de configuración, ni claves, ni historial
de commits.

No hace falta creer a este documento en nada. Puede leer el código.

## 12. Cambios en este aviso

Podemos cambiar este aviso. La fecha del principio siempre muestra cuándo cambió
por última vez. A los titulares de cuenta se les informará por correo
electrónico de los cambios que importen.
