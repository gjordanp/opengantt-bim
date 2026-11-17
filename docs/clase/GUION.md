# Guion de la demo (minutos 20 a 45)

Proyecto de respaldo: **Edificio Lyon** (ya armado). Para la demo en vivo usa un proyecto nuevo y deja el de respaldo sin tocar.
Archivos: `docs/clase/prompt-ia.md` (prompt), `docs/clase/cronograma-ia.json` (respuesta de la IA lista), IFC `20067_ceslagos corto.ifc` (escritorio).

Las láminas siguen estas cinco partes (cada una con su chip «Demo · Parte N de 5»). El prompt completo está en `prompt-ia.md`.

| Min | Parte | Clics | Si falla |
|---|---|---|---|
| 20–24 | **1. Cronograma con IA** (láminas del prompt 1/2 y 2/2, y «Importar la respuesta») | Proyectos → Importar con IA → copiar instrucciones → pegar en ChatGPT/Claude junto con la descripción (`prompt-ia.md`) → copiar el JSON → pegarlo → Importar. Esperado: 60 tareas, 50 vínculos | Pegar el contenido de `cronograma-ia.json` |
| 24–29 | **Interludio: la Gantt** (5 láminas: cómo se ve, cómo se trabaja, línea de balance, curva S, ruta crítica) | En el proyecto recién importado: recorrer tabla y barras; cambiar una duración (se reacomoda); botones **Línea de balance**, **Curva S** y **Ruta crítica** (llama) de la barra del Gantt; volver a apagarlos. La línea de balance se ve en resúmenes plegados con superficie (proyecto «Stephan») | Mostrar las láminas con capturas |
| 29–32 | **2. Modelo IFC** (láminas IFC y modos de vista) | Visor 3D → importar → `.ifc` corto; Configuración del visor → Modo: Sólido, Solo líneas, Rayos X; transparencia | Abrir «Edificio Lyon» |
| 32–35 | **3. Grupos** | Panel Buscar → Combinar → Piso × Ciclo → Crear grupos (G1, G2…) | — |
| 35–39 | **4. Asignar** | Columna Grupos: escribir `G1` y `G2` en dos tareas, seleccionarlas y arrastrar el cuadrito del borde para seguir la serie (G3, G4…). Elegir una tarea: su grupo se resalta en la ventana Grupos; probar el filtro de texto | Mostrar el proyecto de respaldo, ya asignado |
| 39–45 | **5. Simulación 4D** (láminas 4D y «Qué mirar») | Botón 4D → ir a mitad → Reproducir a 1× → elegir una tarea en el Gantt (salta a su fecha) → 2×; cargar avance, línea base y curva S | — |

## Ejercicio (45–52)
Alargar 5 días un ciclo (columna Días), volver a reproducir el 4D y comparar la fecha final y la curva S. Pedir que el curso prediga antes de mostrarlo.

## Antes de empezar (checklist)
- App actualizada y abierta una vez; notificaciones de Windows apagadas; batería conectada.
- Resolución del proyector probada; distribución «Visor arriba» si se ve mejor.
- Proyecto de respaldo y archivo `.ifc` a mano; video de respaldo del 4D listo.
- Ensayo completo con cronómetro (la demo no debe pasar de 25 minutos).

## Límites que decir en voz alta
Instalador sin firma (Windows puede advertir), modelos muy pesados sin probar a fondo, asignación grupo → tarea manual.
