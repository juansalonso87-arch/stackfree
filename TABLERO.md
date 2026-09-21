# Tablero de Planillar

Pendientes y rutinas del proyecto. Lo mantiene Claude al cierre de cada sesión; Juan lo lee acá (GitHub, también desde el celular) o pregunta "¿cómo vamos?". Última actualización: **2026-09-21** (tarde).

## En curso

- **Santander en PDF**: cuando llegue el par (resumen en PDF + Excel del mismo mes) se arma `lib/extractos/santander-pdf.ts` y se valida movimiento por movimiento, como se hizo con BBVA (23 meses, 6 empresas) y Comafi (1 mes).

## Próximo (en orden)

1. **Galicia** (en pausa hasta tener archivos de una PyME): el único par que hay es de una congregación sin cobros con tarjeta ni plataformas; sirvió para conocer los formatos (ver `AGENTS.md`) pero no alcanza para validar el vocabulario. **Nación**: hace falta un mes real en Excel y PDF.
2. **Payway (Prisma)** como segunda procesadora de la conciliación (misma herramienta que Fiserv). Hace falta el reporte de liquidaciones de Payway y el extracto del banco del mismo período.
3. **Reporte de cobros QR de Fiserv** para conciliar también los créditos que llegan por CVU (hoy quedan como "Fiserv por CVU").
4. **Guías con capturas** en cada herramienta de banco: pestañas "Excel" y "PDF" con las pantallas del home banking marcadas, para gente sin experiencia. Después de terminar las herramientas.
5. **Reorganización del sitio**: portada de Administración por tipo de archivo, un recuadro único que detecta el banco y el formato, buscador, una página por banco.
6. **Páginas de video** (`/videos/...`) con el video como contenido principal y la transcripción completa: hoy Google no indexa el video porque está dentro de la página de la herramienta.
7. **Video 2 (PedidosYa)** y dos shorts verticales del video 1.
8. **Hoja "Control" en el Excel de BBVA** (Comafi la tiene; BBVA muestra los controles solo en pantalla).
9. **AdSense**: cuando Google apruebe la cuenta → cargar datos de pago, crear los 4 bloques display, pasar los IDs, activar el mensaje de consentimiento UE.
10. Opcional: `planillar.com.ar` (nic.ar, ~$8.500/año) redirigido al .com.

## Esperando de Juan

- [ ] Par de **Santander**: resumen en PDF + Excel de movimientos del mismo mes.
- [ ] **Galicia**: Excel y PDF del mismo mes de una cuenta **de comercio** (con cobros con tarjeta, PedidosYa, AFIP…), no la de la congregación. Y el menú exacto de Office Banking para bajar cada formato.
- [ ] **Nación**: Excel y PDF del mismo mes.
- [ ] Decidir cómo agrupar **plazos fijos** (propuesta: categoría "Inversiones" con colocaciones y vencimientos separados) cuando retomemos Galicia.
- [ ] Reporte de **Payway** + extracto del banco del mismo período.
- [ ] **Capturas** de cada home banking para las guías (Win+Shift+S; nombre `banco-formato-N.png`, ej. `bbva-pdf-1.png`). Recién cuando cerremos las herramientas.
- [ ] YouTube: **fijar el comentario** de Planillar en el video 1.
- [ ] Search Console: seguir con las **tandas de indexación** (lista de URLs de los días 2 a 4).
- [ ] AdSense: avisar cuando llegue el mail de **aprobación** (2 a 4 semanas desde el 16/09).

## Hecho (últimas dos semanas)

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
- [ ] **YouTube Studio**: comentarios nuevos.

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
