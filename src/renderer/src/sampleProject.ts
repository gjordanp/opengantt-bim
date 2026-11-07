import type { ProjectData } from '@shared/model'

// Small demo project modelled on a typical building: a container task with
// sections (each with a surface in m²) whose children are the activities that
// the line of balance draws as diagonals.
export const sampleProject: ProjectData = {
  name: 'Edificio demo',
  tasks: [
    { id: '1', text: 'EDIFICIO DEMO', start_date: '2026-01-05', duration: 300, progress: 0.2, parent: '0', type: 'project', open: true },

    { id: '2', text: 'Obras preliminares', start_date: '2026-01-05', duration: 60, progress: 1, parent: '1', type: 'project', open: true, location_surface: 50 },
    { id: '3', text: 'Pilas', start_date: '2026-01-05', duration: 20, progress: 1, parent: '2' },
    { id: '4', text: 'Excavación', start_date: '2026-01-26', duration: 25, progress: 1, parent: '2' },
    { id: '5', text: 'Socalzado', start_date: '2026-02-23', duration: 30, progress: 1, parent: '2' },

    { id: '6', text: 'Obra gruesa', start_date: '2026-03-23', duration: 150, progress: 0.4, parent: '1', type: 'project', open: true, location_surface: 870 },
    { id: '7', text: 'Fundaciones', start_date: '2026-03-23', duration: 16, progress: 1, parent: '6' },
    { id: '8', text: 'Losa subterráneo -2', start_date: '2026-04-14', duration: 16, progress: 0.8, parent: '6' },
    { id: '9', text: 'Losa subterráneo -1', start_date: '2026-05-06', duration: 15, progress: 0.4, parent: '6' },
    { id: '10', text: 'Losa piso 1', start_date: '2026-05-27', duration: 17, progress: 0, parent: '6' },

    { id: '11', text: 'Terminaciones', start_date: '2026-08-03', duration: 120, progress: 0, parent: '1', type: 'project', open: true, location_surface: 300 },
    { id: '12', text: 'Tabiquería', start_date: '2026-08-03', duration: 40, progress: 0, parent: '11' },
    { id: '13', text: 'Pavimentos', start_date: '2026-09-28', duration: 35, progress: 0, parent: '11' },
    { id: '14', text: 'Pintura', start_date: '2026-11-16', duration: 30, progress: 0, parent: '11' }
  ],
  links: [
    { id: 'l1', source: '3', target: '4', type: '0' },
    { id: 'l2', source: '4', target: '5', type: '0' },
    { id: 'l3', source: '7', target: '8', type: '0' },
    { id: 'l4', source: '8', target: '9', type: '0' },
    { id: 'l5', source: '9', target: '10', type: '0' },
    { id: 'l6', source: '12', target: '13', type: '0' },
    { id: 'l7', source: '13', target: '14', type: '0' }
  ]
}
