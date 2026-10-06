import type { SeccionContenido } from "./tools-registry";

/**
 * TEXTO PROPIO DE CADA PÁGINA
 * ---------------------------
 * La clave es el slug de la página (herramienta o variante) y el valor es lo
 * que se explica ahí y en ninguna otra parte del sitio. `obtenerPagina()` lo
 * busca por slug, así que una variante **no** hereda el de su herramienta: si
 * no tiene entrada propia, no muestra nada.
 *
 * Por qué existe este archivo (2026-10-06): AdSense rechazó el sitio por
 * "Contenido de bajo valor". Midiendo el HTML publicado, las 27 páginas de
 * imagen y PDF tenían ~247 palabras cada una y solo el **23 %** del texto no
 * aparecía igual en otra página: el resto eran las insignias, el pie de
 * privacidad y los botones, repetidos 27 veces. Las 7 de Administración, que
 * explican el formato de cada banco, promediaban 697 palabras y 60 % propio, y
 * esas no son el problema.
 *
 * La regla al escribir acá: **si el párrafo sirve igual en otra página, no va**.
 * Nada de "subí tu archivo y listo" ni de repetir que no se sube nada al
 * servidor (eso ya lo dicen la insignia, la FAQ y `NotaPrivacidad`). Lo que sí
 * va: cuándo conviene este formato y cuándo no, qué se pierde al convertir, qué
 * tamaños son los razonables, por qué un archivo sale más grande de lo esperado.
 *
 * Está separado del registry porque son ~6.000 palabras: metidas ahí adentro
 * tapaban la configuración de las herramientas, que es lo que se toca seguido.
 */
export const CONTENIDO_POR_PAGINA: Record<string, SeccionContenido[]> = {
  /* ------------------------------------------------------------------ */
  /* Imagen                                                              */
  /* ------------------------------------------------------------------ */

  "comprimir-imagen": [
    {
      titulo: "Qué se pierde al comprimir y hasta dónde conviene bajar",
      parrafos: [
        "Comprimir una foto no la achica “a la mitad de tamaño” en pantalla: sigue teniendo los mismos píxeles. Lo que se achica es el archivo, y se logra guardando menos información sobre los colores. El ojo humano distingue mucho mejor los cambios de luz que los de color, así que los formatos con pérdida aprovechan eso y redondean los colores de zonas parecidas.",
        "En la práctica, bajar la calidad de 100 a 80 en una foto saca entre el 60 % y el 80 % del peso y casi nadie nota la diferencia. De 80 a 60 se gana bastante menos y ya aparecen manchas en los cielos, en las paredes lisas y alrededor de las letras. Por debajo de 50 se ve en cualquier pantalla. Si la imagen tiene texto, líneas finas o un logo, el límite llega antes: ahí conviene no bajar de 85.",
      ],
    },
    {
      titulo: "Comprimir dos veces no es gratis",
      parrafos: [
        "Cada vez que guardás un JPG con pérdida, el daño se acumula y no se puede deshacer. Una foto comprimida al 70 %, vuelta a abrir y vuelta a guardar al 70 %, queda peor que una comprimida al 70 % una sola vez, aunque el número sea el mismo. Por eso conviene guardar el original en algún lado y comprimir siempre desde él, en vez de comprimir el comprimido.",
        "Si lo que tenés es una captura de pantalla, un gráfico o un dibujo con pocos colores, probá primero achicarlo sin pérdida (PNG o WEBP sin pérdida): en esos casos suele quedar más chico y además perfecto, porque lo que ocupa lugar son los bordes nítidos, justo lo que la compresión con pérdida arruina.",
      ],
    },
  ],

  "comprimir-jpg": [
    {
      titulo: "Por qué tus fotos del celular pesan 4 MB",
      parrafos: [
        "Una cámara de celular de 12 megapíxeles saca imágenes de unos 4000 × 3000 píxeles y las guarda con calidad alta para que se puedan editar después. Eso da archivos de 3 a 6 MB. Para mandar por mail, subir a una web o adjuntar a un trámite, es entre cinco y diez veces más de lo necesario.",
        "Para esos usos, un JPG de calidad 75-85 alcanza y sobra: la misma foto suele quedar entre 300 KB y 800 KB, y en pantalla se ve igual. La diferencia solo aparece si la ampliás al 200 % o si la vas a imprimir en grande.",
      ],
    },
    {
      titulo: "Dónde se nota primero",
      parrafos: [
        "El JPG comprime en bloques de 8 × 8 píxeles, y cuando lo exigís de más esos bloques se empiezan a ver. Los primeros lugares donde aparecen son los degradados suaves —un cielo, una pared pintada, una piel— y el borde entre un color fuerte y uno claro, donde queda una especie de sombra sucia.",
        "Si tu imagen es sobre todo texto sobre fondo blanco (una captura, un escaneo de un papel, un comprobante), el JPG es el formato equivocado por más que lo comprimas poco: las letras quedan con halo. Para eso andan mejor PNG o WEBP, que guardan los bordes exactos.",
      ],
    },
  ],

  "comprimir-png": [
    {
      titulo: "El PNG no pierde nada, así que se achica de otra manera",
      parrafos: [
        "El PNG es un formato sin pérdida: lo que entra es exactamente lo que sale, píxel por píxel. No existe una “calidad 70” como en el JPG. Lo que se puede hacer es guardar la misma imagen de forma más inteligente, y ahí es donde se gana peso.",
        "Las dos palancas reales son reducir la cantidad de colores distintos (una captura de pantalla rara vez usa más de unos pocos cientos, aunque el archivo esté preparado para 16 millones) y comprimir mejor los datos. Juntas suelen sacar entre el 40 % y el 70 % de una captura o un logo, sin que cambie ni un píxel visible.",
      ],
    },
    {
      titulo: "Cuándo un PNG es un error",
      parrafos: [
        "Si lo que tenés es una foto, el PNG casi siempre es la peor opción: una foto de celular guardada en PNG puede pesar 15 MB contra 1 MB en JPG, y se ve igual. El PNG brilla cuando hay zonas de color plano y bordes nítidos: capturas de pantalla, logos, dibujos, gráficos, texto.",
        "La otra razón para quedarse en PNG es la transparencia. Si la imagen tiene fondo transparente y la pasás a JPG, ese fondo se rellena con un color sólido y no hay vuelta atrás. Si necesitás transparencia y menos peso, WEBP hace las dos cosas.",
      ],
    },
  ],

  "comprimir-webp": [
    {
      titulo: "WEBP comprime mejor, pero hay que elegir el modo correcto",
      parrafos: [
        "El WEBP tiene dos modos y no se parecen en nada. El modo con pérdida compite con el JPG y suele dar archivos entre un 25 % y un 35 % más chicos con la misma calidad aparente. El modo sin pérdida compite con el PNG y suele quedar un 20-30 % más chico que él, sin perder un solo píxel.",
        "La elección no es de gusto: depende de la imagen. Para fotos, con pérdida. Para capturas, logos, texto o cualquier cosa con bordes nítidos, sin pérdida. Un WEBP con pérdida aplicado a una captura de pantalla queda más chico que el PNG, sí, pero con las letras sucias.",
      ],
    },
    {
      titulo: "Dónde se ve y dónde no",
      parrafos: [
        "WEBP lo abren todos los navegadores desde 2020, incluido Safari, así que para una página web es seguro. Lo que todavía falla es afuera del navegador: muchos programas de escritorio, algunos sistemas de carga de trámites y bastantes apps viejas no lo reconocen, y Windows lo abre pero no siempre lo muestra en la vista previa de las carpetas.",
        "La regla práctica: WEBP para lo que va a vivir en una web, JPG o PNG para lo que vas a mandar por mail, subir a un formulario oficial o abrir con un programa viejo.",
      ],
    },
  ],

  "redimensionar-imagen": [
    {
      titulo: "Qué medida necesitás realmente",
      parrafos: [
        "La mayoría de las imágenes que circulan son mucho más grandes de lo que hace falta. Una pantalla de notebook común muestra 1920 píxeles de ancho; un celular, entre 400 y 500 píxeles reales de ancho de contenido. Una foto de 4000 píxeles en una web se achica sola para mostrarse, pero el visitante igual descarga el archivo entero.",
        "Medidas que sirven como referencia: 1920 px de ancho para una imagen que ocupa toda la pantalla, 1200 px para una foto dentro de un artículo, 800 px para algo que se ve a media página, 400 px para una miniatura. Para imprimir es otra cuenta: multiplicá los centímetros por 118 para tener una idea de los píxeles necesarios (una foto de 10 × 15 cm necesita cerca de 1200 × 1800).",
      ],
    },
    {
      titulo: "Agrandar no inventa detalle",
      parrafos: [
        "Achicar una imagen funciona bien: hay información de sobra y se descarta la que falta. Agrandarla es otra cosa. Si una foto tiene 500 píxeles de ancho y la llevás a 2000, el programa tiene que inventar tres de cada cuatro píxeles mirando a los vecinos. El resultado es más grande pero más borroso: el detalle que no estaba no aparece.",
        "Por eso, si vas a necesitar una imagen grande, conviene conseguir el original grande y achicarlo, y no al revés. Y cuando achicás, mantené la proporción: si cambiás solo el ancho sin tocar el alto, las caras y los logos quedan estirados.",
      ],
    },
  ],

  "recortar-imagen": [
    {
      titulo: "Recortar no es lo mismo que redimensionar",
      parrafos: [
        "Recortar saca partes de la imagen: elegís un rectángulo y lo de afuera se descarta. Lo que queda conserva exactamente la calidad original, porque no se tocó ningún píxel de los que sobrevivieron. Redimensionar, en cambio, mantiene toda la escena pero la achica o agranda.",
        "Son dos operaciones distintas que a veces se confunden porque las dos dan un archivo más chico. Si lo que te molesta es que entra demasiada cosa en la foto, recortá. Si lo que te molesta es que el archivo pesa mucho, redimensioná o comprimí.",
      ],
    },
    {
      titulo: "Las proporciones que piden las redes y los trámites",
      parrafos: [
        "Cada lugar donde subís una imagen espera una forma distinta, y si no se la das, la recorta él, casi siempre mal. Las más usadas: 1:1 (cuadrada) para fotos de perfil y publicaciones de Instagram; 4:5 para la publicación vertical de Instagram, que es la que más pantalla ocupa; 9:16 para historias, reels y TikTok; 16:9 para miniaturas de YouTube, presentaciones y la mayoría de las pantallas; 3:2 y 4:3 para fotos tradicionales e impresión.",
        "Si fijás la proporción antes de mover el recuadro, podés elegir qué parte de la escena entra sin arriesgarte a que después te corten la cabeza en el encuadre automático.",
      ],
    },
  ],

  "recortar-imagen-circular": [
    {
      titulo: "El círculo lo hace la transparencia, no el recorte",
      parrafos: [
        "Las imágenes son siempre rectangulares: no existe un archivo con forma de círculo. Lo que se hace es recortar un cuadrado y dejar transparentes las cuatro esquinas de afuera del círculo. Por eso el resultado tiene que ser PNG o WEBP, que guardan transparencia; si lo pasás a JPG, esas esquinas se vuelven blancas y se ve un cuadrado con un círculo adentro.",
        "Eso también explica por qué, al abrir el archivo en el visor de Windows o de Mac, podés ver un fondo blanco o a cuadritos: es la forma que tiene el programa de mostrar “acá no hay nada”. Cuando lo pongas sobre un fondo de color, el círculo va a quedar bien.",
      ],
    },
    {
      titulo: "Para foto de perfil, casi nunca hace falta",
      parrafos: [
        "WhatsApp, Instagram, LinkedIn y casi todas las apps muestran la foto de perfil en círculo por su cuenta: les subís un cuadrado y ellas la redondean. Recortarla antes igual sirve, pero por otro motivo: te deja elegir exactamente qué queda adentro del círculo, en vez de confiar en el encuadre automático, que suele cortar demasiado cerca de la cara.",
        "Donde sí hace falta de verdad es cuando vas a poner la imagen vos: un logo redondo sobre un fondo de color, un avatar en una firma de mail, una foto dentro de una presentación o de un documento. Ahí, sin transparencia, se vería el cuadrado.",
      ],
    },
  ],

  "quitar-fondo-imagen": [
    {
      titulo: "Cómo decide qué es fondo",
      parrafos: [
        "No hay una regla de color de por medio: un modelo de inteligencia artificial, entrenado con millones de fotos, estima para cada píxel qué probabilidad tiene de pertenecer al objeto principal. Por eso funciona con fondos complicados, donde el viejo truco de “sacar todo lo verde” fracasaba, y por eso también se equivoca de maneras raras a veces.",
        "Ese modelo pesa unos 40 MB y se descarga la primera vez que usás la herramienta. Después queda guardado en el navegador, así que la segunda imagen sale enseguida. Todo el cálculo pasa en tu máquina: por eso una computadora lenta o un celular viejo tardan más, y conviene no cerrar la pestaña mientras procesa.",
      ],
    },
    {
      titulo: "Dónde falla y cómo ayudarlo",
      parrafos: [
        "Lo que peor le sale es el pelo suelto, el pelaje, las plantas con hojas finas, el humo, los vidrios y cualquier cosa semitransparente: en esos bordes tiene que decidir entre blanco o negro donde en realidad hay una mezcla. También se confunde cuando el objeto y el fondo tienen el mismo color, o cuando hay varias personas y no está claro cuál es la principal.",
        "Ayuda bastante partir de una foto nítida, bien iluminada y con el sujeto ocupando buena parte del encuadre. Si tenés la opción de sacar la foto de nuevo, un fondo liso y de un color distinto al del objeto mejora el resultado más que cualquier ajuste posterior.",
      ],
    },
  ],

  /* ------------------------------------------------------------------ */
  /* Conversión                                                          */
  /* ------------------------------------------------------------------ */

  "convertir-imagen": [
    {
      titulo: "Qué formato conviene para qué",
      parrafos: [
        "JPG es el formato de las fotos: comprime muchísimo y lo abre absolutamente todo, pero pierde calidad y no admite transparencia. PNG no pierde nada y guarda transparencia, lo que lo hace ideal para capturas, logos y dibujos, pero para fotos da archivos enormes. WEBP hace las dos cosas —con y sin pérdida, con transparencia— y pesa menos que los dos, aunque fuera del navegador todavía hay programas que no lo abren. AVIF comprime aún mejor que WEBP, pero el soporte es más nuevo y conviene usarlo solo para la web.",
        "GIF quedó para animaciones cortas: para una imagen fija es casi siempre la peor opción, porque solo admite 256 colores. BMP no comprime nada y hoy solo aparece dentro de programas viejos de Windows.",
      ],
    },
    {
      titulo: "Convertir no recupera lo perdido",
      parrafos: [
        "Si una foto ya está en JPG y perdió detalle, pasarla a PNG no se lo devuelve: vas a tener un archivo mucho más grande con exactamente la misma calidad. La conversión conserva lo que hay, nunca lo mejora.",
        "La dirección que sí cuesta cara es ir de un formato con transparencia a uno sin ella. Al pasar un PNG o un WEBP con fondo transparente a JPG, ese fondo se rellena con un color sólido y no hay forma de volver atrás salvo conservando el original.",
      ],
    },
  ],

  "convertir-png-a-jpg": [
    {
      titulo: "Lo que ganás y lo que perdés",
      parrafos: [
        "Esta es la conversión que más peso saca. Un PNG guarda la imagen entera sin perder nada, y en una fotografía eso significa archivos de 5 a 15 MB donde el JPG resuelve con menos de 1 MB. Si lo que tenés en PNG es una foto —por ejemplo, una captura de una foto, o algo que exportó un programa en PNG por defecto—, pasarla a JPG suele achicarla diez veces.",
        "El costo es doble: el JPG pierde algo de detalle, poco si la calidad es alta, y sobre todo no admite transparencia. Si el PNG tenía fondo transparente, en el JPG ese fondo pasa a ser blanco, y si la imagen se iba a usar sobre un fondo de color, se va a notar el recuadro.",
      ],
    },
    {
      titulo: "Cuándo no conviene hacerlo",
      parrafos: [
        "Si el PNG es una captura de pantalla, un gráfico, un logo o cualquier cosa con texto y bordes nítidos, el JPG le va a hacer mal: alrededor de cada letra aparece un halo sucio, y en los bordes entre dos colores planos se ven manchas. Encima, en ese tipo de imagen el JPG a veces ni siquiera pesa menos que el PNG.",
        "Para capturas y gráficos, dejalos en PNG o pasalos a WEBP sin pérdida. El JPG está pensado para las fotos, donde el detalle es irregular y los errores de compresión se esconden.",
      ],
    },
  ],

  "convertir-jpg-a-png": [
    {
      titulo: "Para qué sirve realmente esta conversión",
      parrafos: [
        "Conviene aclarar algo primero: pasar un JPG a PNG no mejora la imagen. El detalle que el JPG descartó cuando se guardó no vuelve; lo que vas a obtener es un archivo bastante más grande con exactamente la misma calidad, a veces cinco o diez veces más pesado.",
        "Entonces, ¿cuándo sirve? Cuando el PNG es lo que te piden o lo que necesita el próximo paso: un sistema que solo acepta PNG, un programa de diseño, una plataforma que exige ese formato para los logos, o cuando vas a editar la imagen varias veces y no querés que cada guardado la degrade un poco más.",
      ],
    },
    {
      titulo: "El PNG frena la degradación de acá en adelante",
      parrafos: [
        "La ventaja concreta de trabajar en PNG es que es un formato sin pérdida: podés abrirlo, editarlo y guardarlo cincuenta veces y siempre va a quedar igual. Con JPG, cada guardado agrega un poco de daño, y después de varias idas y vueltas la diferencia se ve.",
        "Ojo con una expectativa frecuente: el PNG admite transparencia, pero convertir un JPG no la crea. La imagen va a seguir teniendo su fondo, solo que ahora en un formato que podría tener transparencia si se la agregaras con otra herramienta.",
      ],
    },
  ],

  "convertir-webp-a-jpg": [
    {
      titulo: "Por qué te encontrás con un WEBP",
      parrafos: [
        "Casi todas las páginas web entregan hoy sus imágenes en WEBP porque pesan menos y cargan más rápido. Cuando guardás una imagen desde el navegador, te baja en ese formato. El problema aparece después: querés adjuntarla a un trámite, abrirla con un programa viejo o mandarla por mail, y del otro lado no la reconocen.",
        "Pasarla a JPG resuelve eso de una. El JPG lo abre cualquier cosa con pantalla desde hace treinta años, y es el formato que esperan casi todos los formularios, sistemas administrativos e impresoras.",
      ],
    },
    {
      titulo: "Qué cambia en el archivo",
      parrafos: [
        "El JPG va a pesar más que el WEBP original —entre un 25 % y un 35 % más para la misma calidad aparente—, porque el WEBP comprime mejor. Es el precio de que lo abra todo el mundo.",
        "Y si el WEBP tenía transparencia, en el JPG se pierde: el fondo pasa a ser sólido. Es raro en una foto bajada de una web, pero pasa seguido con logos e íconos. Si la imagen tiene fondo transparente y querés conservarlo, el destino correcto es PNG, no JPG.",
      ],
    },
  ],

  "convertir-webp-a-png": [
    {
      titulo: "Cuándo PNG es el destino correcto para un WEBP",
      parrafos: [
        "Si el WEBP que tenés es un logo, un ícono, una captura o cualquier imagen con fondo transparente, PNG es el formato al que conviene pasarlo: es el único de los tres clásicos que conserva la transparencia, y además no pierde ni un píxel en el camino.",
        "Para una fotografía sin transparencia, en cambio, PNG suele ser un desperdicio: el archivo puede quedar cinco o diez veces más pesado que el WEBP original sin verse mejor. En ese caso, JPG es la conversión que tiene sentido.",
      ],
    },
    {
      titulo: "Sin pérdida, pero con una salvedad",
      parrafos: [
        "El PNG no descarta nada de lo que recibe, así que la conversión no agrega ningún daño. Lo que no puede hacer es reparar lo que el WEBP ya había perdido: si ese WEBP se guardó con pérdida, la imagen ya venía con detalle descartado y el PNG lo va a conservar tal cual, defectos incluidos.",
        "O sea: el PNG garantiza que de acá en adelante no se pierda más, no que la imagen mejore.",
      ],
    },
  ],

  "convertir-jpg-a-webp": [
    {
      titulo: "La conversión para páginas web",
      parrafos: [
        "Si administrás una web o una tienda online, pasar las fotos de JPG a WEBP es de las cosas más rentables que podés hacer: los archivos quedan entre un 25 % y un 35 % más chicos con la misma calidad aparente, y eso se traduce en páginas que cargan antes. Google mide la velocidad de carga como factor de posicionamiento, así que no es solo comodidad del visitante.",
        "Todos los navegadores en uso hoy abren WEBP, incluido Safari desde 2020. Para una web, la compatibilidad ya no es un problema.",
      ],
    },
    {
      titulo: "Dónde no lo uses",
      parrafos: [
        "Fuera del navegador el panorama cambia: bastantes programas de escritorio, sistemas de trámites y apps no reconocen WEBP, y aunque Windows lo abre, no siempre lo muestra en la vista previa de las carpetas. Si la imagen va adjunta a un mail, a un formulario oficial o a una impresión, dejala en JPG.",
        "Y como el JPG de origen ya venía comprimido con pérdida, tené en cuenta que el WEBP resultante hereda esos defectos: va a pesar menos, pero no se va a ver mejor que el original.",
      ],
    },
  ],

  "convertir-png-a-webp": [
    {
      titulo: "El mejor cambio para capturas y logos",
      parrafos: [
        "Esta conversión es la más conveniente del grupo cuando la imagen tiene bordes nítidos. El WEBP sin pérdida conserva cada píxel exactamente igual que el PNG —ni una letra se ensucia— y aun así suele quedar entre un 20 % y un 30 % más chico. No hay nada que perder salvo compatibilidad.",
        "Además mantiene la transparencia, así que un logo con fondo transparente en PNG sigue funcionando igual en WEBP, pesando menos.",
      ],
    },
    {
      titulo: "El límite es dónde se va a abrir",
      parrafos: [
        "La única razón para quedarse en PNG es el lugar de destino. Si la imagen va a una web, WEBP es mejor en todo. Si la vas a mandar por mail, subir a un sistema administrativo o abrir con un programa de escritorio viejo, el PNG te evita el riesgo de que del otro lado no lo puedan abrir.",
        "Si el PNG original era en realidad una fotografía, vale la pena probar el WEBP con pérdida en vez del sin pérdida: ahí la diferencia de peso deja de ser del 25 % y pasa a ser de diez veces.",
      ],
    },
  ],

  "heic-a-jpg": [
    {
      titulo: "Qué es HEIC y por qué tu iPhone lo usa",
      parrafos: [
        "Desde iOS 11, los iPhone y iPad guardan las fotos en HEIC en vez de JPG. El motivo es el espacio: a igual calidad, un HEIC ocupa más o menos la mitad que un JPG, así que entran el doble de fotos en el mismo teléfono. Además guarda cosas que el JPG no puede, como más tonos de color y las fotos en ráfaga o en vivo dentro de un solo archivo.",
        "El problema es afuera del mundo Apple. Windows necesita un complemento que a veces se paga, muchos programas no lo abren, y buena parte de los formularios de trámites, sistemas de gestión e impresoras directamente lo rechazan. De ahí que la foto se vea perfecta en el celular y del otro lado no se pueda abrir.",
      ],
    },
    {
      titulo: "Cómo evitar que te vuelva a pasar",
      parrafos: [
        "En el iPhone podés hacer que la cámara guarde directamente en JPG: Ajustes → Cámara → Formatos → “Más compatible”. Vas a usar más espacio, pero las fotos nuevas se van a abrir en todos lados. La otra opción, que conserva el ahorro de espacio, es Ajustes → Fotos → “Transferir a Mac o PC” → “Automático”: ahí el teléfono convierte solo al pasarlas por cable.",
        "Las fotos que ya sacaste siguen en HEIC igual, así que para esas la conversión sigue haciendo falta. Al pasarlas a JPG el archivo pesa alrededor del doble, que es exactamente el ahorro que HEIC te había dado.",
      ],
    },
  ],

  "heic-a-png": [
    {
      titulo: "Cuándo elegir PNG en vez de JPG para un HEIC",
      parrafos: [
        "Para una foto común, JPG es casi siempre la mejor salida de un HEIC: pesa poco y lo abre todo. El PNG tiene sentido en dos casos puntuales. El primero, cuando lo que capturaste no es una foto sino texto o un gráfico: una pantalla fotografiada, un documento, una pizarra. Ahí el PNG conserva los bordes de las letras nítidos, mientras el JPG les deja un halo.",
        "El segundo caso es cuando la imagen va a pasar por varias ediciones. Como el PNG no pierde nada al guardar, podés abrirla y guardarla las veces que quieras sin que se degrade, cosa que con JPG no pasa.",
      ],
    },
    {
      titulo: "Preparate para un archivo grande",
      parrafos: [
        "El PNG no descarta información, así que una foto de iPhone que ocupaba 2 MB en HEIC puede terminar en 10 o 15 MB en PNG. Es el precio de no perder nada, y para una fotografía casi nunca vale la pena: el ojo no nota la diferencia con un JPG de calidad alta que pesa una décima parte.",
        "Si el peso te importa pero no querés perder calidad, WEBP sin pérdida es el punto medio: conserva todo como el PNG y pesa bastante menos.",
      ],
    },
  ],

  "pdf-a-imagen": [
    {
      titulo: "El texto deja de ser texto",
      parrafos: [
        "Un PDF guarda el texto como texto: se puede seleccionar, copiar y buscar, y se ve nítido en cualquier tamaño. Al convertirlo a imagen, cada página pasa a ser una grilla de píxeles. Se ve igual, pero ya no se puede seleccionar ni buscar nada, y si lo ampliás mucho se pixela.",
        "Eso a veces es justo lo que se busca —mandar una página por WhatsApp, pegarla en una presentación, publicarla sin que la copien fácil— y a veces es un problema. Si lo que necesitás es que el otro pueda buscar o copiar, el PDF conviene mandarlo como PDF.",
      ],
    },
    {
      titulo: "La resolución decide todo",
      parrafos: [
        "Al convertir hay que elegir cuántos píxeles tiene cada página, y ahí se juega el resultado. Alrededor de 72 a 100 puntos por pulgada alcanza para mirar en pantalla y da archivos chicos. Para que el texto se lea cómodo al ampliar, conviene 150. Para imprimir con calidad, 300, aunque ahí cada página puede pesar varios MB.",
        "Una hoja A4 a 150 puntos por pulgada da una imagen de unos 1240 × 1754 píxeles. Si el PDF tiene letra chica, tablas o un sello, quedarse corto de resolución es el error más común: la página se ve bien de lejos y es ilegible al acercarse.",
      ],
    },
  ],

  "pdf-a-jpg": [
    {
      titulo: "JPG es la salida práctica para compartir",
      parrafos: [
        "Si vas a mandar las páginas por WhatsApp o mail, subirlas a un formulario o pegarlas en una presentación, JPG es la opción cómoda: pesa poco y lo abre cualquier aparato. Una página A4 a resolución media suele quedar entre 200 KB y 600 KB, contra varios MB si la misma página saliera en PNG.",
        "Eso lo hace ideal para documentos con fotos, folletos, catálogos y cualquier PDF donde lo que manda es la imagen más que la letra chica.",
      ],
    },
    {
      titulo: "Cuidado con los documentos de puro texto",
      parrafos: [
        "El JPG comprime con pérdida, y donde más se nota es justamente en el borde entre negro y blanco: o sea, en las letras. Un contrato, una factura o una planilla convertidos a JPG con calidad media quedan con un halo gris alrededor de cada palabra, y si después alguien los imprime se ve sucio.",
        "Para esos casos hay dos salidas: subir bastante la resolución para que el defecto se disimule, o convertir a PNG, que guarda las letras exactas. Si el documento es un trámite o algo que otro va a tener que leer con atención, mejor PNG.",
      ],
    },
  ],

  "pdf-a-png": [
    {
      titulo: "Para documentos donde la letra importa",
      parrafos: [
        "El PNG no pierde nada, así que cada letra, cada línea de una tabla y cada sello quedan exactamente como en el PDF. Es la opción correcta cuando el documento es texto: contratos, facturas, certificados, planillas, formularios, cualquier cosa que alguien vaya a leer con atención o a imprimir.",
        "También es la opción cuando la página va a servir de base para otra cosa: una captura que vas a recortar, un diagrama que vas a anotar, una página que vas a pegar en un documento. Como no se degrada, podés trabajarla sin que empeore.",
      ],
    },
    {
      titulo: "El peso es el precio",
      parrafos: [
        "Una página A4 en PNG a resolución pensada para leer cómodo puede pesar entre 1 y 3 MB, varias veces más que en JPG. Con un PDF de treinta páginas eso se nota: pueden ser 50 MB o más, demasiado para mandar por mail.",
        "Una buena regla: si el PDF es texto y son pocas páginas, PNG. Si son muchas páginas o el documento es sobre todo fotos, JPG y subí un poco la resolución para compensar.",
      ],
    },
  ],

  /* ------------------------------------------------------------------ */
  /* PDF                                                                 */
  /* ------------------------------------------------------------------ */

  "unir-pdf": [
    {
      titulo: "El orden es lo que más se equivoca",
      parrafos: [
        "Al unir varios PDF, el resultado sigue el orden en que están puestos los archivos, no el orden de sus nombres ni la fecha. Es el error más común: se arrastran cinco documentos de una vez y quedan mezclados, y recién se descubre al abrirlo. Conviene revisar el orden antes de unir, sobre todo si los archivos se llaman “escaneo1”, “escaneo2”… porque muchos sistemas ordenan “10” antes que “2”.",
        "Un detalle que sorprende: las páginas no se renumeran. Si cada PDF traía su propio “Página 1 de 3” impreso, esos números siguen ahí, porque son parte del dibujo de la página y no un dato que el PDF pueda recalcular.",
      ],
    },
    {
      titulo: "Qué pasa con el peso y con lo que traía cada archivo",
      parrafos: [
        "El tamaño del PDF unido es más o menos la suma de los originales: unir no comprime. Si juntás diez escaneos de 4 MB vas a tener un archivo de 40 MB, y muchos sistemas de mail cortan en 25 MB. Si te pasa, lo que conviene es achicar los escaneos antes de unirlos, no después.",
        "Al unir también suelen perderse cosas que vivían en cada archivo por separado: los campos de formulario rellenables, las firmas digitales (que dejan de ser válidas porque el documento firmado cambió) y a veces los marcadores. El contenido visible de las páginas, en cambio, se conserva tal cual.",
      ],
    },
  ],

  "dividir-pdf": [
    {
      titulo: "Para qué se divide un PDF",
      parrafos: [
        "Los motivos más frecuentes son tres. Mandar solo una parte: de un contrato de cuarenta páginas, el otro necesita las dos del anexo. Bajar el peso: un PDF de 60 MB no entra en un mail, pero partido en tres sí. Y separar lo que llegó junto: el escáner guarda veinte comprobantes en un solo archivo y hace falta uno por cada uno.",
        "En todos los casos, las páginas que salen conservan exactamente la calidad que tenían: dividir no vuelve a comprimir ni degrada nada.",
      ],
    },
    {
      titulo: "Lo que queda afuera al partir el archivo",
      parrafos: [
        "Hay cosas que son del documento entero y no sobreviven al corte. Una firma digital deja de ser válida, porque certificaba el archivo completo tal como estaba. Los marcadores y el índice interno suelen perderse o quedar apuntando a páginas que ya no están. Y si el PDF tenía un formulario, los campos que quedaron en otra parte desaparecen.",
        "Para un documento que vas a mandar como comprobante o que tiene valor legal, conviene conservar siempre el original completo, aunque mandes solo una parte.",
      ],
    },
  ],

  "extraer-paginas-pdf": [
    {
      titulo: "Extraer o dividir: cuál te sirve",
      parrafos: [
        "Dividir parte el documento en varios archivos y te los devuelve todos. Extraer se queda solo con las páginas que pediste y arma un único PDF nuevo con ellas: el resto no aparece en ningún lado.",
        "La diferencia importa cuando lo que querés es mandar una parte. Si de un informe de ochenta páginas necesitás las cinco del resumen, extraer te da justo ese archivo de cinco páginas. Dividir te daría dos archivos y después tendrías que elegir uno igual.",
      ],
    },
    {
      titulo: "Cómo escribir los rangos",
      parrafos: [
        "Las páginas se piden por número, separadas por comas, y se pueden usar guiones para los tramos: “1-3, 7, 12-15” toma la 1, la 2, la 3, la 7 y de la 12 a la 15. El orden en que las escribas no cambia el resultado: las páginas salen siempre en el orden que tenían en el documento.",
        "Un detalle para no errarle: contá las páginas como las numera el visor de PDF, que empieza en 1 en la primera hoja del archivo. Si el documento tiene portada o índice, el número impreso en la hoja casi nunca coincide con el número de página real, y ese desfasaje es la causa más frecuente de extraer las páginas equivocadas.",
      ],
    },
  ],

  "rotar-pdf": [
    {
      titulo: "Por qué los escaneos salen de costado",
      parrafos: [
        "Un escáner guarda la hoja tal como la alimentaste, y el alimentador automático no sabe si el papel estaba horizontal o vertical. Por eso un lote de escaneos suele tener algunas páginas giradas 90 grados y, si alguien dio vuelta la pila, otras cabeza abajo. Lo mismo pasa con los PDF armados a partir de fotos del celular.",
        "También es común que un PDF se vea bien en pantalla y salga de costado al imprimir: eso indica que la página está girada pero el visor está corrigiendo la vista sin tocar el archivo.",
      ],
    },
    {
      titulo: "Girar no toca el contenido",
      parrafos: [
        "La rotación de un PDF es un dato de cada página, no un cambio en lo que hay dibujado. El texto sigue siendo texto —seleccionable y buscable—, las imágenes conservan su calidad exacta y el archivo no engorda. Es una de las pocas operaciones sobre PDF que no tiene ningún costo.",
        "Esa misma propiedad explica un problema frecuente: algunos programas viejos y algunas impresoras ignoran el dato de rotación y muestran la página como estaba originalmente. Si te pasa, lo que hay que hacer es guardar el PDF ya rotado, que es exactamente lo que hace esta herramienta, en vez de girar la vista en el visor.",
      ],
    },
  ],

  "imagen-a-pdf": [
    {
      titulo: "Por qué conviene mandar un PDF y no las fotos sueltas",
      parrafos: [
        "Cuando te piden documentación, mandar un PDF en vez de seis fotos cambia bastante las cosas: llega un solo archivo, las páginas quedan en el orden correcto, el que lo recibe lo abre de una y lo puede imprimir sin acomodar nada. Muchos sistemas de trámites directamente solo aceptan PDF.",
        "Además, el PDF fija el tamaño de la hoja. Una foto puede verse enorme o diminuta según dónde se abra; una página de PDF siempre es del tamaño que vos definiste.",
      ],
    },
    {
      titulo: "Que se vea bien al imprimir",
      parrafos: [
        "La imagen se coloca dentro de una hoja, así que lo que importa es que tenga suficientes píxeles para ese tamaño. Para una hoja A4 completa con calidad de impresión hacen falta cerca de 2480 × 3508 píxeles; con la mitad alcanza para leer en pantalla. Una foto de celular moderna supera eso sin problema, pero una captura de pantalla chica o una imagen bajada de una web se va a ver pixelada al imprimir.",
        "Si estás fotografiando documentos, dos cosas mejoran el resultado más que cualquier ajuste: buena luz pareja —sin la sombra de tu propia cabeza— y la cámara paralela a la hoja, no en diagonal. El PDF guarda la foto tal cual, así que lo que salió torcido va a quedar torcido.",
      ],
    },
  ],

  "jpg-a-pdf": [
    {
      titulo: "La conversión típica de los trámites",
      parrafos: [
        "Las fotos del celular son JPG, y casi todo trámite que pide “el DNI”, “la factura de un servicio” o “el comprobante” lo quiere en PDF. De ahí que esta sea de las conversiones más buscadas: sacás la foto, la pasás a PDF y la subís.",
        "Si son varios documentos, conviene armar un solo PDF con todas las páginas en el orden que pidieron, en vez de mandar un archivo por foto. Muchos sistemas aceptan un único adjunto, y el que revisa lo agradece.",
      ],
    },
    {
      titulo: "El peso del PDF lo ponen las fotos",
      parrafos: [
        "El PDF resultante pesa más o menos lo que pesaban las imágenes juntas: pasar a PDF no comprime. Con cinco fotos de 4 MB vas a tener un PDF de unos 20 MB, y bastantes formularios oficiales ponen un límite de 5 o 10 MB.",
        "Si te pasa, el camino es comprimir o achicar las fotos antes de armar el PDF. Para un documento escaneado con el celular, una imagen de 1500 a 2000 píxeles de ancho se lee perfecto y pesa una fracción de la original.",
      ],
    },
  ],

  "png-a-pdf": [
    {
      titulo: "Capturas de pantalla y comprobantes digitales",
      parrafos: [
        "Las capturas de pantalla se guardan en PNG, y son el caso más común de esta conversión: el comprobante de una transferencia, la pantalla de una gestión, la confirmación de un pago. Pasarlas a PDF las vuelve presentables —una página por captura, tamaño de hoja fijo— y aceptables para los sistemas que solo reciben PDF.",
        "Como el PNG no pierde calidad, el texto de la captura llega al PDF nítido, que es justo lo que hace falta cuando alguien tiene que leer un número de operación o un importe.",
      ],
    },
    {
      titulo: "La transparencia se rellena",
      parrafos: [
        "Si el PNG tiene fondo transparente —típico en logos e imágenes recortadas—, al pasar a PDF ese fondo se vuelve blanco, porque una hoja no puede ser transparente. En una captura no cambia nada, pero si estabas armando algo de diseño conviene saberlo de antemano.",
        "El otro punto a mirar es el tamaño: las capturas suelen tener menos píxeles de los que necesita una hoja A4 impresa. Se van a leer bien en pantalla, pero si el trámite se imprime, una captura chica estirada a toda la hoja se ve pixelada. Cuando puedas elegir, capturá la ventana a pantalla completa en vez de un pedacito.",
      ],
    },
  ],
};
