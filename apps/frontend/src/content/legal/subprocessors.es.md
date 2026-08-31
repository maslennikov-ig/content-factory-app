---
title: Destinatarios de los datos
updated: 2026-08-20
language: es
---

# Destinatarios de los datos

## 1. Qué es esta lista

Aquí se enumeran todos aquellos a los que Content Factory puede enviar datos, y
se dice qué llega a cada uno. Se escribió leyendo el código, no repasando
nombres de servicios, y cambia cuando cambia el producto.

Si un destinatario no está en esta lista, no le va nada.

## 2. Cómo leer la lista

Los destinatarios se dividen en tres grupos:

- **siempre activos** — participan en el funcionamiento del servicio sin nada
  por su parte;
- **activados por decisión suya** — callados hasta que usted o un administrador
  de su espacio de trabajo los configura;
- **qué no tiene este producto** — cosas que un producto como este suele llevar
  y este no.

Cada entrada dice quiénes son, qué se les envía, por qué y dónde se trata.

## 3. Siempre activos

### 3.1 Resend — entrega de correo de servicio

**Quién.** Un servicio de entrega de correo, una empresa de Estados Unidos. El
correo de este producto se envía desde la región `eu-west-1`.

**Qué se envía.** La dirección del destinatario, el asunto y el cuerpo de un
correo de servicio. Hay tres tipos: activación de cuenta, restablecimiento de
contraseña y confirmación de dirección cuando se añade el inicio de sesión con
contraseña. Los correos de confirmación del propio boletín salen por la misma
clave.

**Qué no se envía.** Contenido de publicaciones, archivos subidos, tokens de
plataformas conectadas, datos de organizaciones.

**Por qué.** Sin entrega de correo no funciona el restablecimiento de
contraseña, y una dirección no puede convertirse en una forma de iniciar sesión:
solo lo hace después de seguir el enlace del correo. No tenemos servidor de
correo propio, y un correo de confirmación enviado desde nuestro host caería en
spam en silencio.

### 3.2 Listmonk — el boletín

**Quién.** Un sistema de boletines. Funciona en nuestro propio host. No es una
empresa externa.

**Qué se envía.** La dirección de correo de una cuenta nueva, y solo después de
que usted marcara explícitamente la casilla al registrarse. Sin la marca no se
envía nada.

**Dónde.** La dirección no sale de la red de nuestro host. Listmonk envía sus
correos de confirmación de suscripción a través del mismo Resend.

**Cómo darse de baja.** Con el enlace del propio correo.

### 3.3 Nuestro propio recolector de errores

**Quién.** Nuestro recolector de errores, en nuestro propio host. No Sentry.io y
ningún otro servicio externo.

**Qué se envía.** Un identificador de evento, la hora, un nivel, el entorno, la
versión de compilación, el nombre del servicio, el tipo de error y los marcos de
pila: la ruta del archivo relativa a la raíz del repositorio, el nombre de la
función, la línea y la columna.

**Qué no se envía.** El usuario, la petición, las cabeceras, las cookies, la
dirección IP, el User-Agent, las migas de pan, el texto del modelo, campos
arbitrarios. El evento se reconstruye a partir de una lista permitida de campos
en lugar de reenviarse tal como llegó. El navegador lo manda a la dirección del
propio sitio, no directamente al recolector.

### 3.4 Telegram — inicio de sesión

**Quién.** Telegram, si inicia sesión a través de él.

**Qué se envía.** El intercambio de OpenID Connect durante el inicio de sesión.
El botón solo aparece cuando el inicio de sesión con Telegram está configurado
en este servidor.

## 4. Activados por decisión suya

### 4.1 Modelos de IA: OpenAI y OpenRouter

**Qué se envía.** Prompts y textos de publicaciones.

**Cuándo.** Solo si un espacio de trabajo configura la IA por su cuenta: o bien
introduciendo su propia clave, o bien porque el administrador le dio una cuota
sobre una clave gestionada por el servidor. No hay cruce entre esos dos modos:
las claves de una organización nunca se usan para otra, y la clave compartida
nunca se pone en lugar de una clave propia que falte.

**Dónde están las claves.** Las claves propias de una organización se guardan
cifradas en la base de datos.

### 4.2 Tavily — búsqueda web

**Qué se envía.** Las consultas de búsqueda que el producto construye mientras
prepara material.

**Cuándo.** Con las mismas reglas que los modelos de IA: solo después de que un
espacio de trabajo lo configure.

### 4.3 API de redes sociales

**Qué se envía.** El contenido de las publicaciones y los archivos adjuntos.

**Cuándo.** Después de que conecte un canal y programe o publique una
publicación.

**Adónde exactamente.** A la red cuyo canal conectó: Facebook, Instagram,
Threads, LinkedIn, TikTok, Pinterest, Reddit, Slack, Discord, Telegram, VK,
Mastodon, X y otras plataformas admitidas. Lo que pasa con los datos después de
eso se rige por las reglas de esa plataforma.

### 4.4 Webhooks y enlaces que usted indica

**Qué se envía.** Si configura un webhook, el objeto de la publicación entero, a
la dirección que indicó. Si le da al producto un enlace del que extraer
contenido, el servidor lo consulta en su propio nombre.

**Cuándo.** Solo por acción directa suya. La dirección la elige usted.

## 5. Qué no tiene este producto

El producto no lleva ninguna analítica de producto de terceros. Se eliminaron
junto con sus dependencias: PostHog, Plausible, Google Tag Manager, dub,
datafa.st, el píxel de Facebook y los eventos de servidor de Facebook, el Sentry
alojado, el widget de chat Chatbase, el editor de imágenes Polotno, Beehiiv.

Devolver cualquiera de ellos — como dependencia, como importación o como
dirección escrita a mano — hace fallar una comprobación automática de la
compilación. Las páginas en vivo no cargan ningún script externo. Las fuentes
son locales. El frontend no hace peticiones externas directas: todo pasa por
nuestro propio backend.

No hay redes publicitarias. No se venden datos. No se comparte nada con
intermediarios de datos.

## 6. Alojamiento

El servidor está en los Países Bajos. La base de datos, los archivos, el sistema
de boletines y el recolector de errores funcionan todos en él. No damos el
nombre de la empresa de alojamiento.

El único destinatario fuera de los Países Bajos que participa en el
funcionamiento del servicio sin ninguna acción por su parte es Resend. Todo lo
de la sección 4 se activa por decisión suya.

## 7. Cambios en esta lista

La lista cambia según cambia el producto. La fecha del principio muestra cuándo
cambió por última vez. Un destinatario nuevo aparece en esta lista antes de que
le lleguen los primeros datos.

## 8. Contacto

Preguntas sobre esta lista: bot de Telegram [@content_factory_adtbot](https://t.me/content_factory_adtbot).
