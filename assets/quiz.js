/*
 * Contenido del juego: preguntas y orden de la presentación.
 * Solo lo carga la pantalla del presentador (los celulares no ven las respuestas).
 *
 * - correct: índice de la opción correcta (0 = A, 1 = B, 2 = C, 3 = D)
 * - time:    segundos para responder
 */
window.QZ_QUIZ = {
  title: 'Urgencias respiratorias',
  slidesPath: 'slides/',
  slidesExt: 'webp',

  questions: [
    {
      id: 'q1',
      context: 'La paciente acaba de llegar a urgencias con dificultad respiratoria grave.',
      text: '¿Cuál debe ser la conducta inicial?',
      options: [
        'Iniciar manejo avanzado de la vía aérea inmediatamente, sin valoración inicial.',
        'Verificar la respuesta de la paciente, evaluar rápidamente su estado y activar la atención de emergencia.'
      ],
      correct: 1,
      time: 30
    },
    {
      id: 'q2',
      context: '',
      text: '¿Cuál es el diagnóstico más probable?',
      options: ['Taponamiento cardiaco', 'Infarto agudo de miocardio', 'Tromboembolia pulmonar', 'Neumotórax'],
      correct: 2,
      time: 20
    },
    {
      id: 'q3',
      context: '¡Hay un dato que todavía no conocemos!',
      text: '¿Qué debemos preguntar?',
      options: [
        'Preguntar si la paciente toma sus medicamentos con bebidas alcohólicas.',
        'Investigar si ha suspendido algún medicamento, cuál y desde cuándo.'
      ],
      correct: 1,
      time: 25
    },
    {
      id: 'q4',
      context: '',
      text: '¿Cuál de estas alteraciones es la amenaza inmediata más evidente entre las opciones?',
      options: ['Temperatura', 'Frecuencia cardiaca', 'Estado neurológico', 'Hipoxia'],
      correct: 3,
      time: 20
    },
    {
      id: 'q5',
      context: '¿Cuál es el siguiente paso?',
      text: '¿Qué hacemos ahora?',
      options: [
        'Evaluar la vía aérea y comprobar si está permeable.',
        'Buscar lesiones, sangrado u otros hallazgos relevantes.'
      ],
      correct: 0,
      time: 25
    },
    {
      id: 'q6',
      context: '',
      text: 'En ABCDE, ¿qué corresponde a la letra B?',
      options: ['Buena circulación', 'Respiración y ventilación', 'Estado neurológico', 'Control de hemorragias'],
      correct: 1,
      time: 20
    },
    {
      id: 'q7',
      context: 'La paciente empeora su estado de conciencia y deja de responder.',
      text: '¿Qué hacemos ante la falta de respuesta?',
      options: [
        'Asumir que está dormida y esperar a que responda.',
        'Activar la respuesta de emergencia y comprobar respiración y pulso simultáneamente durante un máximo de 10 segundos.'
      ],
      correct: 1,
      time: 30
    },
    {
      id: 'q8',
      context: '',
      text: '¿Cuáles son los ritmos desfibrilables?',
      options: [
        'Asistolia y actividad eléctrica sin pulso',
        'Bradicardia sinusal y asistolia',
        'Fibrilación ventricular y taquicardia ventricular sin pulso',
        'Actividad eléctrica sin pulso y ritmo sinusal'
      ],
      correct: 2,
      time: 30
    },
    {
      id: 'q9',
      context: 'El monitor muestra actividad eléctrica sin pulso.',
      text: '¿Qué hacemos?',
      options: [
        'Continuar RCP, administrar adrenalina según el algoritmo y buscar causas reversibles.',
        'Administrar una descarga eléctrica inmediatamente.'
      ],
      correct: 0,
      time: 30
    },
    {
      id: 'q10',
      context: '',
      text: '¿Cuál de las siguientes opciones corresponde a una T?',
      options: ['Trombosis pulmonar', 'Hipoxia', 'Hipotermia', 'Hipopotasemia'],
      correct: 0,
      time: 20
    }
  ],

  /*
   * Orden de la presentación. Los números de "slide" son las páginas del PDF
   * (archivos slides/01.webp ... slides/36.webp).
   *   { slide: n }               diapositiva normal
   *   { lobby: true }            pantalla con el QR y el PIN para unirse
   *   { question: 'q1' }         pregunta en vivo (los celulares responden)
   *   { slide: n, reveal: 'q1' } diapositiva de la respuesta: aquí los celulares ven si acertaron
   *   { board: 'q1' }            tabla de posiciones
   *   { podium: true }           podio final
   */
  sequence: [
    { slide: 1 },                      // Portada
    { slide: 2 },                      // ¡Bienvenidos! ¿Cómo participar?
    { lobby: true },                   // Únanse con el QR
    { slide: 3 },                      // Premio especial
    { slide: 4 },                      // Personajes
    { slide: 5 },                      // Urgencias (1)
    { slide: 6 },                      // Conozcamos a la paciente (2)
    { slide: 7 },                      // Decisión del equipo médico (3)
    { question: 'q1' },
    { slide: 8, reveal: 'q1' },        // B correcta (4)
    { board: 'q1' },
    { slide: 9 },                      // Signos vitales (5)
    { slide: 10 },                     // ¿Diagnóstico más probable? (6)
    { question: 'q2' },
    { slide: 11, reveal: 'q2' },       // Respuesta: C (7)
    { board: 'q2' },
    { slide: 12 },                     // ¿Qué debemos preguntar? (8)
    { slide: 13 },                     // Hay un dato que no conocemos (9)
    { question: 'q3' },
    { slide: 14, reveal: 'q3' },       // B correcta (10)
    { board: 'q3' },
    { slide: 15 },                     // ¿Qué debemos corregir primero? (11)
    { slide: 16 },                     // Amenaza inmediata (12)
    { question: 'q4' },
    { slide: 17, reveal: 'q4' },       // Respuesta: D (13)
    { board: 'q4' },
    { slide: 18 },                     // ¿Cuál es el siguiente paso? (14)
    { slide: 19 },                     // ¿Qué hacemos ahora? (15)
    { question: 'q5' },
    { slide: 20, reveal: 'q5' },       // A correcta (16)
    { board: 'q5' },
    { slide: 21 },                     // ABCDE, letra B (17)
    { question: 'q6' },
    { slide: 22, reveal: 'q6' },       // Respuesta: B (18)
    { board: 'q6' },
    { slide: 23 },                     // Alerta de deterioro (19)
    { slide: 24 },                     // ¿Qué hacemos ante la falta de respuesta? (20)
    { slide: 25 },                     // Opciones A/B (21)
    { question: 'q7' },
    { slide: 26, reveal: 'q7' },       // B correcta (22)
    { board: 'q7' },
    { slide: 27 },                     // Ritmos desfibrilables (23)
    { question: 'q8' },
    { slide: 28, reveal: 'q8' },       // Respuesta: C (24)
    { board: 'q8' },
    { slide: 29 },                     // Actividad eléctrica sin pulso (25)
    { question: 'q9' },
    { slide: 30, reveal: 'q9' },       // A correcta (26)
    { board: 'q9' },
    { slide: 31 },                     // ¿Cuál corresponde a una T? (27)
    { question: 'q10' },
    { slide: 32, reveal: 'q10' },      // Respuesta: A (28)
    { slide: 33 },                     // Tabla de H y T
    { slide: 34 },                     // ¿Qué nos llevamos de este caso?
    { slide: 35 },                     // La paciente se recuperó
    { podium: true },                  // Podio y ganador del premio
    { slide: 36 }                      // Gracias
  ]
};
