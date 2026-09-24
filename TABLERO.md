# Tablero de Planillar

Pendientes y rutinas del proyecto. Lo mantiene Claude al cierre de cada sesión; Juan lo lee acá (GitHub, también desde el celular) o pregunta "¿cómo vamos?". Última actualización: **2026-09-23**.

## En curso

- **Reclamo a PedidosYa**: los **$ 674.089 de "descuentos a cobrar"** de agosto (su propio reporte de pedidos los informa como financiados por ellos). Están listados con número de pedido en la hoja "Revisar" del Excel de la herramienta. Juan tiene que hacer el reclamo con el ejecutivo de cuenta.
- **Shorts / TikTok**: los 3 primeros shorts de Mercado Pago están publicados (TikTok @planillar.com: los tres el 21/09; YouTube: el 1 publicado, el 2 y el 3 programados para el 23 y el 24/09). Los shorts 4-6 tienen guion (Word) y extractos de demo probados en `04 - Shorts seguridad y bancos`: falta que Juan los grabe y yo los armo con el mismo molde.
- **Santander en PDF**: cuando llegue el par (resumen en PDF + Excel del mismo mes) se arma `lib/extractos/santander-pdf.ts` y se valida movimiento por movimiento, como se hizo con BBVA (23 meses, 6 empresas) y Comafi (1 mes).
- **Contador de usos**: funcionando en producción desde el 23/09 (base `planillardb`, Upstash for Redis plan Free, conectada al proyecto `stackfree`). La insignia no se ve hasta los 100 usos por herramienta (`MINIMO_PARA_MOSTRAR` en `lib/contador.ts`; con `?contador=1` se ve igual). **Queda por decidir con Juan si ese umbral de 100 está bien** o si lo bajamos.

## Próximo (en orden)

1. **Galicia** (en pausa hasta tener archivos de una PyME): el único par que hay es de una congregación sin cobros con tarjeta ni plataformas; sirvió para conocer los formatos (ver `AGENTS.md`) pero no alcanza para validar el vocabulario. **Nación**: hace falta un mes real en Excel y PDF.
2. **Payway (Prisma)** como segunda procesadora de la conciliación (misma herramienta que Fiserv). Hace falta el reporte de liquidaciones de Payway y el extracto del banco del mismo período.
3. **Reporte de cobros QR de Fiserv** para conciliar también los créditos que llegan por CVU (hoy quedan como "Fiserv por CVU").
4. **Guías con capturas** en cada herramienta de banco: pestañas "Excel" y "PDF" con las pantallas del home banking marcadas, para gente sin experiencia. Después de terminar las herramientas.
5. **Reorganización del sitio**: portada de Administración por tipo de archivo, un recuadro único que detecta el banco y el formato, buscador, una página por banco.
6. **Páginas de video** (`/videos/...`) con el video como contenido principal y la transcripción completa: hoy Google no indexa el video porque está dentro de la página de la herramienta.
7. **Video 2 (PedidosYa)**.
8. **Hoja "Control" en el Excel de BBVA** (Comafi la tiene; BBVA muestra los controles solo en pantalla).
9. **AdSense**: cuando Google apruebe la cuenta → cargar datos de pago, crear los 4 bloques display, pasar los IDs, activar el mensaje de consentimiento UE.
10. Opcional: `planillar.com.ar` (nic.ar, ~$8.500/año) redirigido al .com.

## Esperando de Juan

- [ ] **PedidosYa**: hacer el reclamo por los $ 674.089 de descuentos (hoja "Revisar" del Excel, con número de pedido) y avisar qué contestan.
- [ ] **Instalar OBS Studio** (obsproject.com) para grabar la pantalla completa: la barra de juegos de Windows (Win+G) no filma el escritorio ni los carteles del sistema, por eso no salía el panel de wifi.
- [ ] **Grabar los shorts 4, 5 y 6** (30-40 s cada uno) siguiendo los guiones de `04 - Shorts seguridad y bancos`, con los archivos de demo de esa carpeta (nunca un extracto real). Mandarme las grabaciones. Alternativa acordada el 23/09: Juan graba **solo la voz** y yo hago los movimientos de pantalla con un guion automático (`playwright-core` ya instalado en `_scripts`).
- [ ] Par de **Santander**: resumen en PDF + Excel de movimientos del mismo mes.
- [ ] **Galicia**: Excel y PDF del mismo mes de una cuenta **de comercio** (con cobros con tarjeta, PedidosYa, AFIP…), no la de la congregación. Y el menú exacto de Office Banking para bajar cada formato.
- [ ] **Nación**: Excel y PDF del mismo mes.
- [ ] Decidir cómo agrupar **plazos fijos** (propuesta: categoría "Inversiones" con colocaciones y vencimientos separados) cuando retomemos Galicia.
- [ ] Reporte de **Payway** + extracto del banco del mismo período.
- [ ] **Capturas** de cada home banking para las guías (Win+Shift+S; nombre `banco-formato-N.png`, ej. `bbva-pdf-1.png`). Recién cuando cerremos las herramientas.
- [ ] **TikTok**: el link clicleable en la bio se habilita a los 1.000 seguidores → revisar entonces (la cuenta @planillar.com quedó completa el 21/09; el cambio gratis a cuenta de empresa ya no existe en Argentina y la "verificada" con documentos no se hace).
- [ ] YouTube: **fijar el comentario** de Planillar en el video 1.
- [ ] Search Console: seguir con las **tandas de indexación** (lista de URLs de los días 2 a 4).
- [ ] AdSense: avisar cuando llegue el mail de **aprobación** (2 a 4 semanas desde el 16/09).

## Hecho (últimas dos semanas)

- **24/09** **Herramienta nueva: PDF del banco a Excel.** Lee la tabla del resumen reconociendo las columnas por su posición, así que funciona con bancos que no tienen analizador propio (probado con Galicia: coincide al centavo con el total impreso en el propio resumen). Un casillero tildado por defecto agrega la clasificación completa si el banco es BBVA o Comafi; si no lo reconocemos, entrega igual la tabla y lo explica. Es además la puerta de entrada por buscador: "pasar pdf del banco a excel" es lo que la gente busca de verdad.
- **24/09** **LinkedIn desplegado** en `Documents\Planillar - LinkedIn\`: textos de la página de empresa y del perfil personal, branding con las imágenes generadas y 16 posteos con calendario. Falta que Juan cree la cuenta (Claude no puede crear cuentas).
- **23/09** **Encontrado un bug grande que estaba tapado: el formulario de contacto no se podía enviar.** Buscando por qué "Quitar fondo" fallaba en el celular de Juan apareció la causa raíz: la política de seguridad del sitio se aplicaba por página, pero el sitio navega sin recargar, así que al llegar haciendo clic regía la política de la página anterior y el navegador bloqueaba tanto la descarga del modelo de IA como **el envío del formulario de contacto**. Las dos cosas funcionaban escribiendo la dirección a mano, que es como probábamos siempre. Corregido con una política única para todo el sitio y verificado entrando por clic.
- **23/09** **Arreglado "Quitar fondo"**: a Juan le fallaba en dos dispositivos y "Reintentar" no servía de nada. No era su conexión: la librería del modelo de IA memoriza también los fallos, así que el primer error quedaba pegado hasta recargar la página entera. Ahora se recupera sola (probado saboteando la descarga a propósito, en local y en producción).
- **23/09** **Contador de usos** en cada herramienta, andando en planillar.com (base `planillardb` en Vercel, Upstash for Redis plan Free, $0): una insignia verde con cuántas veces se usó, que sube sola cuando alguien termina de procesar un archivo. Cuenta trabajo hecho (no visitas), tiene tope por navegador y por día, y lo único que viaja es el nombre de la herramienta (30 bytes), así que la CSP sigue igual. No se muestra ningún número inventado: sin base configurada no aparece, y debajo de 100 usos tampoco. `/verificar-privacidad` y la política de privacidad quedaron actualizadas para declararlo.
- **23/09** Guiones de los shorts corregidos: se graba con **OBS Studio**, no con Win+G (la barra de juegos no filma el escritorio ni los carteles del sistema, por eso el panel de wifi no aparecía en el video del short 4).
- **22/09** El Excel de la liquidación de PedidosYa suma el **lado comercial**: hoja "Cuándo vendés" (por hora, por día de la semana, app vs. efectivo, promos y Plus, tiempos de preparación y entrega) y hoja "Productos" (ranking por sucursal). En pantalla, el cuadro por hora, los 15 productos top y los KPIs de ticket promedio y mejor día.
- **22/09** La comparación con la planilla del local **deduce sola qué anota el local** (venta total, solo lo cobrado por la app o solo el efectivo) y lo dice en el resultado; se puede forzar a mano. Además: el enlace de la portada que prometía la privacidad ahora lleva a `/verificar-privacidad` (antes iba a Administración) y esa página se ofrece desde el header, la insignia de cada herramienta y el pie de resultado de todas.
- **22/09** La liquidación de PedidosYa **compara con la planilla diaria del local**: se pega la venta digital día por día y explica cada diferencia. Con los 30 días reales de agosto: 22 días cierran al peso sumando los descuentos que PedidosYa cobra después (el local anota la venta como la mostró la app), 2 más por un pedido cancelado anotado como venta, y quedaron 4 con diferencias chicas. En el mes el local informó $ 637.096 de más. Además, las migas de pan de las herramientas de Administración ahora dicen "Administración" y llevan a su portada, en vez de "Herramientas".
- **22/09** Nueva herramienta **Liquidación de PedidosYa**: un solo recuadro donde entran el estado de cuenta semanal (Finanzas) y el reporte de pedidos de cada local, se reconocen solos y se cruzan pedido por pedido. Validada con agosto 2026 completo (4 estados de cuenta + 2 reportes, 1.251 pedidos, $ 36.468.260): venta y comisión idénticas al centavo en los dos reportes, y aparecieron los dos costos que el estado de cuenta no muestra (tarifa de pago online e IVA, 6,4 % de la venta).
- **21/09** Guiones de los **shorts 4-6** (seguridad, costo del banco, Santander a Excel) y dos extractos de demo (BBVA y Santander, "Lo de Ana" agosto 2026) generados y verificados: 157 y 195 movimientos, todos los controles en verde, 0 en "Otros".
- **21/09** Cuenta de **TikTok @planillar.com** creada y los **3 shorts publicados** (TikTok y YouTube; 2 y 3 programados). Links de YouTube y TikTok en el footer y en "Acerca de".
- **21/09** Tres **shorts verticales** del video de Mercado Pago generados sin editor (Whisper para la transcripción + ffmpeg + textos dibujados con el motor del sitio): el 4,04 %, transferencias al alias, canal más caro. Textos de publicación listos.
- **21/09** Galicia: se revisó el único par disponible (PDF + Excel, 19 movimientos, coinciden) y se decidió esperar archivos de una PyME. Tablero del proyecto creado.
- **21/09** BBVA en PDF validado con 20 pares PDF/Excel de 6 empresas (18 idénticos al centavo; en 2 el Excel del banco omite movimientos). Resúmenes con varias cuentas. Ajustes: "GESTION PAGO" (Cabal), Experta, créditos de aseguradoras, cheques por canje/depósito/ventanilla, código 543 y 880.
- **20/09** BBVA y Comafi aceptan el **resumen de cuenta en PDF** (mismos controles, saldo corrido verificado, contraparte desde las tablas del resumen). Textos del sitio actualizados. pdf.js pasa a la build compatible con navegadores viejos.
- **18/09** Nueva herramienta **Conciliación Fiserv ↔ banco** (Comafi 109/109, BBVA 91/91, Santander 104/104). PedidosYa: hoja **Caja por Día** (online vs. efectivo).
- **17/09** Categorías **Seguros** y **Prepagas y salud** separadas. BBVA: débito directo de Zurich. Santander: servicio de cuenta → Mantenimiento.
- **16/09** Dominio **planillar.com** y nuevo nombre. **Video 1** (Mercado Pago) publicado e insertado en el sitio. Cuenta de AdSense creada. Mail hola@planillar.com. Placeholders de publicidad activos.
- **14-15/09** Formulario de contacto (Web3Forms). Analizadores validados con archivos reales de Santander, BBVA, Comafi, Mercado Pago y PedidosYa. Botón "Contar qué pasó".

## Rutinas

### Diario (5 minutos)
- [ ] **Gmail**: mensajes del formulario de contacto y del botón "Contar qué pasó" (llegan de Web3Forms). Si alguien reporta un archivo que no se leyó, pasárselo a Claude.
- [ ] **Vercel Analytics** (vercel.com → proyecto → Analytics): visitantes, países, referrers. Recordá que Estados Unidos/Linux suele ser Google renderizando páginas.
- [ ] **YouTube Studio** y **TikTok**: comentarios nuevos (responder el mismo día; las preguntas "¿y con mi banco funciona?" son ideas de shorts).

### Semanal (20 minutos, un día fijo)
- [ ] **Search Console → Rendimiento**: impresiones, clics y posición por consulta. Lo que importa: que aparezcan búsquedas de bancos, Mercado Pago, PedidosYa y Fiserv (poco volumen, poca competencia). Las de imágenes/PDF salen en posición 30+ y no es la apuesta.
- [ ] **Search Console → Indexación → Páginas**: cuántas de las ~40 URLs están indexadas y por qué motivo faltan las otras.
- [ ] **AdSense**: estado de la revisión del sitio.
- [ ] **Publicar algo**: un video, un short o una tanda de URLs a indexar.
- [ ] **Probar una herramienta con un archivo real del mes** (rotando banco): si algo cae en "Otros" o un control no cierra, anotarlo acá.

### Mensual
- [ ] Pasarle a Claude los **extractos nuevos del mes** (Excel y PDF) para correr la regresión de categorías.
- [ ] **Web3Forms**: cuota del plan gratis (250 mensajes/mes) en app.web3forms.com.
- [ ] **Porkbun**: tarjeta vigente para la renovación automática del dominio (vence el 16/09/2027).

## Cómo se usa

- Al empezar una sesión: "¿cómo vamos?" → Claude lee este tablero y dice qué toca.
- Al terminar: Claude lo actualiza y lo sube junto con los cambios del día.
- Las decisiones y hallazgos técnicos no van acá: viven en `AGENTS.md`.
