# Guion de la demo (minutos 20 a 45)

Proyecto de respaldo: **Edificio Lyon** (ya armado). Para la demo en vivo usa un proyecto nuevo y deja el de respaldo sin tocar.
Archivos: `docs/clase/cronograma-ia.json` (respuesta de la IA lista), IFC `20067_ceslagos corto.ifc` (escritorio).

| Min | Paso | Clics | Si falla |
|---|---|---|---|
| 20–24 | **1. Cronograma con IA** | Proyectos → Importar con IA → copiar instrucciones → pegar en ChatGPT/Claude con la descripción del edificio → pegar la respuesta → Importar | Pegar el contenido de `cronograma-ia.json` |
| 24–27 | **2. Importar el IFC** | Visor 3D → botón de importar → elegir el `.ifc` corto | Abrir «Edificio Lyon» |
| 27–29 | Recorrer el modelo | Configuración del visor → Modo: Sólido, Solo líneas, Rayos X; deslizador de transparencia | — |
| 29–33 | **3. Grupos** | Panel Grupos → Combinar → Piso × Ciclo → Crear grupos (aparecen G1, G2…) | — |
| 33–36 | **4. Asignar** | Columna Grupos del Gantt: escribir `G1`, `G2, G9`… en algunas tareas | Mostrar el proyecto de respaldo, ya asignado |
| 36–42 | **5. Simulación 4D** | Botón 4D → ir a mitad → Reproducir a 1× → elegir una tarea en el Gantt (salta a su fecha) → 2× | — |
| 42–45 | Avance y curva S | Cargar avance en una tarea; mostrar línea base y curva S | — |

## Ejercicio (45–52)
Alargar 5 días un ciclo (columna Días), volver a reproducir el 4D y comparar la fecha final y la curva S. Pedir que el curso prediga antes de mostrarlo.

## Antes de empezar (checklist)
- App actualizada y abierta una vez; notificaciones de Windows apagadas; batería conectada.
- Resolución del proyector probada; distribución «Visor arriba» si se ve mejor.
- Proyecto de respaldo y archivo `.ifc` a mano; video de respaldo del 4D listo.
- Ensayo completo con cronómetro (la demo no debe pasar de 25 minutos).

## Límites que decir en voz alta
Instalador sin firma (Windows puede advertir), modelos muy pesados sin probar a fondo, asignación grupo → tarea manual.
