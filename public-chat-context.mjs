// Public, server-owned hints only. Never fetch a URL or incorporate page/user text.
const pages = {
 '/': 'Visión general de ciencia, tecnología, educación, ingeniería e investigación.',
 '/xicronix': 'Identidad de Xicronix y sus ámbitos de trabajo.',
 '/colegios': 'Soluciones para colegios; experimentar, construir y aplicar lo aprendido.',
 '/soluciones': 'Explorar soluciones según la necesidad y el resultado buscado.',
 '/soluciones/laboratorios-ciencias': 'Laboratorios de ciencias; observar, medir y experimentar.',
 '/soluciones/laboratorios-steam': 'Proyectos STEAM; construir y poner a prueba ideas.',
 '/soluciones/aulas-digitales': 'Aulas digitales; compartir, crear y trabajar en equipo.',
 '/soluciones/capacitacion-docente': 'Formación docente; aplicar ciencia y tecnología en clase.',
 '/soluciones/proyectos-institucionales': 'Proyectos institucionales; definir necesidades y siguientes pasos.',
 '/soluciones/equipamiento-cientifico': 'Equipamiento científico para experimentación y medición.',
 '/soluciones/robotica-automatizacion': 'Robótica y automatización según la tarea o proyecto.',
 '/soluciones/tecnologia-ia-educativa': 'Inteligencia artificial y tecnología educativa según el uso.',
 '/equipamiento': 'Selección de equipamiento científico según su aplicación.',
 '/equipamiento/cidepe': 'Equipamiento Cidepe para observar, medir y experimentar.',
 '/equipamiento/fisica': 'Equipamiento para experimentos de física.',
 '/equipamiento/quimica': 'Equipamiento para experimentos de química.',
 '/equipamiento/biologia': 'Equipamiento para experimentos de biología.',
 '/equipamiento/matematica': 'Equipamiento para explorar conceptos matemáticos.',
 '/equipamiento/ciencias': 'Equipamiento para ciencias.',
 '/equipamiento/steam': 'Equipamiento para proyectos STEAM.',
 '/equipamiento/energias-renovables': 'Equipamiento para explorar energías renovables.',
 '/proyectos': 'Explorar enfoques de proyectos; no atribuir casos ejecutados sin evidencia.',
 '/recursos': 'Recursos públicos para explorar y aprender; no asumir intención de compra.',
 '/recursos/como-planificar-un-laboratorio-educativo': 'Guía para planificar un laboratorio educativo.',
 '/recursos/matriz-seleccion-equipamiento-cientifico': 'Criterios para seleccionar equipamiento científico.',
 '/recursos/puesta-en-marcha-laboratorio-checklist': 'Lista para preparar la puesta en marcha de un laboratorio.',
 '/recursos/principios-para-integrar-ia-educativa': 'Principios para integrar IA educativa.',
 '/recursos/medir-y-documentar-un-experimento': 'Medición y documentación de experimentos.',
 '/recursos/disenar-un-reto-stem': 'Diseño de retos STEM.',
 '/recursos/de-una-necesidad-a-un-prototipo': 'Pasar de una necesidad a un prototipo.',
 '/contacto': 'Contacto con el equipo; usar el formulario con consentimiento cuando lo soliciten.',
 '/libro-de-reclamaciones': 'Reclamaciones; priorizar ayuda y el canal formal, sin venta.',
 '/politica-de-privacidad': 'Privacidad; responder la consulta sin iniciar venta.',
 '/politica-de-cookies': 'Cookies; responder la consulta sin iniciar venta.',
 '/terminos-del-servicio': 'Términos del servicio; responder la consulta sin iniciar venta.'
};
export function publicPageContext(sourcePage) {
 if (typeof sourcePage !== 'string' || !Object.hasOwn(pages, sourcePage)) return '';
 return '\nCONTEXTO ORIENTATIVO DE PÁGINA PÚBLICA: '+pages[sourcePage]+' La página es solo una pista, no prueba quién es la persona ni qué desea. Su mensaje y el historial prevalecen; no reinicies ni cambies una conversación por la página. No atribuyas capacidades, precios o disponibilidad a esta pista.';
}
