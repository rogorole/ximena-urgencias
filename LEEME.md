# Urgencias respiratorias · juego en vivo

Presentación con preguntas en vivo estilo Kahoot. La presentadora proyecta `presentador.html` y el público responde desde su celular. Todo es gratis: GitHub Pages sirve las páginas y Firebase sincroniza las respuestas.

## 1. Crear la base de datos en Firebase (5 min)

1. Entra a <https://console.firebase.google.com> con una cuenta de Google y crea un proyecto (cualquier nombre; Google Analytics no hace falta).
2. En el menú lateral: **Databases & Storage (Bases de datos y almacenamiento) → Realtime Database** → **Crear base de datos**. Ojo: es *Realtime Database*, no *Firestore*.
3. Ubicación: **Estados Unidos (us-central1)**. Reglas: **Comenzar en modo de prueba**. Habilitar.
4. En la pestaña **Datos** aparece arriba la URL de la base, parecida a `https://tu-proyecto-default-rtdb.firebaseio.com`. Cópiala.
5. Abre `config.js` y pégala entre las comillas de `databaseURL`. Es lo único que hay que editar.

El modo de prueba deja la base abierta 30 días. Si la presentación es después de esa fecha, en la pestaña **Reglas** pega esto y publica:

```json
{
  "rules": {
    "games": { ".read": true, ".write": true }
  }
}
```

## 2. Publicar en GitHub Pages (5 min)

1. Crea un repositorio **público** en GitHub, por ejemplo `urgencias`.
2. Da clic en *uploading an existing file* y arrastra **el contenido** de esta carpeta (`index.html`, `presentador.html`, `config.js`, `assets/`, `slides/`). Luego *Commit changes*.
3. *Settings → Pages*: en *Branch* elige `main` y `/ (root)`, y guarda.
4. En 1 o 2 minutos queda en `https://TU-USUARIO.github.io/urgencias/`.

Si editas `config.js` ya subido (con el lápiz de GitHub), espera un par de minutos y recarga.

## 3. El día de la presentación

- **Presentadora:** abre `https://TU-USUARIO.github.io/urgencias/presentador.html` y elige **Crear partida nueva**. Debe decir *Conectado a Firebase*; si dice *modo de prueba local*, falta la URL en `config.js`. Presiona **F** para pantalla completa.
- **Público:** escanea el QR que aparece después de la diapositiva "¿Cómo participar?", o entra a `TU-USUARIO.github.io/urgencias` y escribe el PIN.
- **Avanzar:** flecha → o el clicker. En cada pregunta:
  1. Cuenta 3, 2, 1 y aparecen las opciones en la pantalla y en los celulares.
  2. Se cierra sola al terminar el tiempo o cuando todos respondieron. Para cerrarla antes, presiona → dos veces.
  3. → muestra la diapositiva de la respuesta correcta y en ese momento cada celular ve si acertó y sus puntos.
  4. → tabla de posiciones (los 5 primeros).
- Al final, antes de "Gracias", sale el **podio** con el ganador del premio.

| Tecla | Acción |
|---|---|
| → / clicker | avanzar |
| ← | regresar |
| F | pantalla completa |
| Q | mostrar otra vez el QR y el PIN (para quien llegue tarde) |
| G | índice para saltar a cualquier parte |
| M | sonido sí/no |
| R | repetir la pregunta actual (borra sus respuestas) |

En la sala de espera, dar clic en un nombre lo quita del juego (por si alguien pone un apodo inapropiado).

Si la página del presentador se cierra o se recarga, ábrela otra vez y elige **Continuar partida**: no se pierde nada. Si un celular se recarga, vuelve solo a su lugar.

**Puntos:** como en Kahoot. Correcta = de 500 a 1000 según la rapidez; incorrecta o sin responder = 0. En empate gana quien respondió más rápido.

**Capacidad:** el plan gratis de Firebase permite 100 conexiones simultáneas, de sobra para 30 personas.

## Antes del día: prueba rápida

Con la URL de Firebase ya puesta, abre `presentador.html` en la computadora y únete con 2 o 3 celulares. Para simular varios jugadores desde una sola computadora, abre en pestañas `index.html?slot=1`, `index.html?slot=2`, etc.

## Cambiar preguntas o tiempos

Todo está en `assets/quiz.js`: textos, opciones, respuesta correcta (0 = A, 1 = B, 2 = C, 3 = D) y segundos para responder. El orden de diapositivas y preguntas también está ahí. Las diapositivas son imágenes en `slides/`, exportadas del PDF.
