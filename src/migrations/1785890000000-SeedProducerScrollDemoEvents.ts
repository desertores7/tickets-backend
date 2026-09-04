import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 20 eventos de demo para el productor `e04cef15-29a8-430a-90be-6a7d4f7943a8`.
 * Sirve para probar scroll infinito en `/producer/events`.
 *
 * - Posters/mapas: URLs de picsum.photos (sin OpenAI ni APIs de pago).
 * - Idempotente por uuid fijo; no inserta si el user/org no existen.
 * - Contenido mínimo: 1–2 tandas en algunos, lineup corto en otros.
 */

const OWNER_USER_UUID = 'e04cef15-29a8-430a-90be-6a7d4f7943a8';

type SeedEvent = {
  uuid: string;
  name: string;
  slug: string;
  description: string;
  startDate: string;
  endDate: string;
  isPublished: 0 | 1;
  publishedAt: string | null;
  venueName: string;
  venueAddress: string;
  venueCity: string;
  venuePostalCode: string;
  googleMapsUrl: string | null;
  maxCapacity: number;
  lineup: string[] | null;
  posterSeed: string;
  mapSeed: string;
  ticketTypes?: Array<{
    uuid: string;
    name: string;
    price: string;
    quantity: number;
    sortOrder: number;
  }>;
};

const DEMO_EVENTS: SeedEvent[] = [
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794301',
    name: 'Noche Electrónica en Palermo',
    slug: 'noche-electronica-palermo-demo',
    description:
      'Sesión de techno y house con DJs locales en un club de Palermo Hollywood. Barra libre hasta las 2 y after hasta el amanecer.',
    startDate: '2026-10-18 23:00:00',
    endDate: '2026-10-19 06:00:00',
    isPublished: 1,
    publishedAt: '2026-09-01 12:00:00',
    venueName: 'Club Niceto',
    venueAddress: 'Niceto Vega 5510',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1414',
    googleMapsUrl: 'https://maps.google.com/?q=Niceto+Vega+5510+CABA',
    maxCapacity: 1200,
    lineup: ['DJ Maru', 'Luna Bass', 'Guest: Kala'],
    posterSeed: 'electronica-palermo',
    mapSeed: 'electronica-palermo-map',
    ticketTypes: [
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794301', name: 'Early bird', price: '18000.00', quantity: 200, sortOrder: 0 },
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794302', name: 'General', price: '25000.00', quantity: 800, sortOrder: 1 }
    ]
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794302',
    name: 'Stand Up Comedy — Jueves de Risa',
    slug: 'stand-up-jueves-risa-demo',
    description:
      'Cuatro comediantes en un formato íntimo de 90 minutos. Ideal para un jueves después del laburo. Open bar soft incluido.',
    startDate: '2026-09-24 21:00:00',
    endDate: '2026-09-24 23:00:00',
    isPublished: 1,
    publishedAt: '2026-08-20 10:00:00',
    venueName: 'Teatro Picadero',
    venueAddress: 'Pasaje Enrique Santos Discépolo 1857',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1033',
    googleMapsUrl: null,
    maxCapacity: 320,
    lineup: ['Martín Guerra', 'Sofía Lira', 'Nano Pérez', 'Invitado sorpresa'],
    posterSeed: 'standup-picadero',
    mapSeed: 'standup-picadero-map',
    ticketTypes: [
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794303', name: 'Platea', price: '12000.00', quantity: 280, sortOrder: 0 }
    ]
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794303',
    name: 'Festival Indie Costanera',
    slug: 'festival-indie-costanera-demo',
    description:
      'Tarde de bandas independientes al aire libre frente al río. Food trucks, merch y dos escenarios rotativos.',
    startDate: '2026-11-08 15:00:00',
    endDate: '2026-11-08 23:30:00',
    isPublished: 1,
    publishedAt: '2026-09-10 09:00:00',
    venueName: 'Parque de la Memoria',
    venueAddress: 'Av. Costanera Rafael Obligado 6745',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1428',
    googleMapsUrl: null,
    maxCapacity: 4500,
    lineup: ['Los Espíritus', 'Mi Amigo Invencible', 'El Mató a un Policía Motorizado'],
    posterSeed: 'indie-costanera',
    mapSeed: 'indie-costanera-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794304',
    name: 'Workshop de Fotografía Nocturna',
    slug: 'workshop-foto-nocturna-demo',
    description:
      'Taller práctico de 4 horas: composición, ISO y revelado express. Traé cámara o celular con modo manual.',
    startDate: '2026-10-05 18:30:00',
    endDate: '2026-10-05 22:30:00',
    isPublished: 0,
    publishedAt: null,
    venueName: 'Espacio Darwin',
    venueAddress: 'Darwin 1154',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1414',
    googleMapsUrl: null,
    maxCapacity: 40,
    lineup: null,
    posterSeed: 'foto-nocturna',
    mapSeed: 'foto-nocturna-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794305',
    name: 'Feria Gastronómica Palermo Soho',
    slug: 'feria-gastro-palermo-demo',
    description:
      'Más de 30 puestos de cocina de autor, vinos de bodega boutique y música acústica en vivo. Entrada con degustación.',
    startDate: '2026-09-27 12:00:00',
    endDate: '2026-09-27 20:00:00',
    isPublished: 1,
    publishedAt: '2026-08-15 11:00:00',
    venueName: 'Plaza Serrano',
    venueAddress: 'Jorge Luis Borges 1974',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1414',
    googleMapsUrl: null,
    maxCapacity: 2000,
    lineup: null,
    posterSeed: 'feria-gastro',
    mapSeed: 'feria-gastro-map',
    ticketTypes: [
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794304', name: 'Pase degustación', price: '8500.00', quantity: 1500, sortOrder: 0 }
    ]
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794306',
    name: 'Clásico de Verano — Quilmes vs Racing',
    slug: 'clasico-verano-quilmes-racing-demo',
    description:
      'Amistoso de pretemporada con plateas y popular. Puertas abren 2 horas antes; estacionamiento limitado.',
    startDate: '2026-12-12 18:00:00',
    endDate: '2026-12-12 21:00:00',
    isPublished: 1,
    publishedAt: '2026-09-01 08:00:00',
    venueName: 'Estadio Centenario',
    venueAddress: 'Av. Vicente López 1450',
    venueCity: 'Quilmes',
    venuePostalCode: '1878',
    googleMapsUrl: null,
    maxCapacity: 18000,
    lineup: null,
    posterSeed: 'futbol-clasico',
    mapSeed: 'futbol-clasico-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794307',
    name: 'Yoga al Amanecer en el Rosedal',
    slug: 'yoga-amanecer-rosedal-demo',
    description:
      'Práctica suave de 75 minutos al aire libre. Traé mat y botella de agua. Cupos limitados por clima.',
    startDate: '2026-10-11 07:00:00',
    endDate: '2026-10-11 08:30:00',
    isPublished: 1,
    publishedAt: '2026-09-05 07:00:00',
    venueName: 'El Rosedal',
    venueAddress: 'Av. Iraola s/n, Parque 3 de Febrero',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1425',
    googleMapsUrl: null,
    maxCapacity: 80,
    lineup: null,
    posterSeed: 'yoga-rosedal',
    mapSeed: 'yoga-rosedal-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794308',
    name: 'Concierto Acústico — La Biblioteca',
    slug: 'acustico-biblioteca-demo',
    description:
      'Show sentado con set íntimo y Q&A al final. Sonido de cámara; se recomienda llegar 20 minutos antes.',
    startDate: '2026-11-20 20:30:00',
    endDate: '2026-11-20 22:30:00',
    isPublished: 0,
    publishedAt: null,
    venueName: 'CC Konex',
    venueAddress: 'Sarmiento 3131',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1196',
    googleMapsUrl: null,
    maxCapacity: 500,
    lineup: ['Valeria Lynch (acústico)', 'Banda soporte'],
    posterSeed: 'acustico-konex',
    mapSeed: 'acustico-konex-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794309',
    name: 'Mercado de Diseño Independiente',
    slug: 'mercado-diseno-independiente-demo',
    description:
      'Diseñadores emergentes, cerámica, textil y joyería. Charlas cortas cada hora en el escenario central.',
    startDate: '2026-10-25 11:00:00',
    endDate: '2026-10-26 19:00:00',
    isPublished: 1,
    publishedAt: '2026-09-12 14:00:00',
    venueName: 'Usina del Arte',
    venueAddress: 'Agustín R. Caffarena 1',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1157',
    googleMapsUrl: null,
    maxCapacity: 3000,
    lineup: null,
    posterSeed: 'mercado-diseno',
    mapSeed: 'mercado-diseno-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430a',
    name: 'After Office Rooftop Microcentro',
    slug: 'after-office-rooftop-demo',
    description:
      'DJ set, cocktails de autor y vista a la ciudad. Dress code smart casual. Capacidad controlada por piso.',
    startDate: '2026-09-18 18:00:00',
    endDate: '2026-09-18 23:00:00',
    isPublished: 1,
    publishedAt: '2026-08-01 12:00:00',
    venueName: 'Alvear Art Hotel — Terraza',
    venueAddress: 'Suipacha 914',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1008',
    googleMapsUrl: null,
    maxCapacity: 250,
    lineup: ['DJ Vera'],
    posterSeed: 'rooftop-after',
    mapSeed: 'rooftop-after-map',
    ticketTypes: [
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794305', name: 'Entrada + 1 trago', price: '15000.00', quantity: 220, sortOrder: 0 }
    ]
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430b',
    name: 'Corrida 10K Puerto Madero',
    slug: 'corrida-10k-madero-demo',
    description:
      'Circuito plano por los diques. Kit del corredor con chip y medalla. Hidratación en km 3, 6 y meta.',
    startDate: '2026-11-02 08:00:00',
    endDate: '2026-11-02 11:00:00',
    isPublished: 1,
    publishedAt: '2026-09-01 09:00:00',
    venueName: 'Puente de la Mujer',
    venueAddress: 'Av. Alicia Moreau de Justo 200',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1107',
    googleMapsUrl: null,
    maxCapacity: 5000,
    lineup: null,
    posterSeed: 'corrida-10k',
    mapSeed: 'corrida-10k-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430c',
    name: 'Cine Bajo las Estrellas',
    slug: 'cine-bajo-estrellas-demo',
    description:
      'Proyección al aire libre de un clásico argentino. Mantas y picnic permitidos. En caso de lluvia se reprograma.',
    startDate: '2026-10-03 20:00:00',
    endDate: '2026-10-03 23:00:00',
    isPublished: 0,
    publishedAt: null,
    venueName: 'Parque Centenario',
    venueAddress: 'Av. Díaz Vélez 4900',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1405',
    googleMapsUrl: null,
    maxCapacity: 800,
    lineup: null,
    posterSeed: 'cine-estrellas',
    mapSeed: 'cine-estrellas-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430d',
    name: 'Expo Vinos del Sur',
    slug: 'expo-vinos-del-sur-demo',
    description:
      'Bodegas de Patagonia y Cuyo presentan etiquetas nuevas. Incluye 6 tickets de degustación y copa de recuerdo.',
    startDate: '2026-12-05 16:00:00',
    endDate: '2026-12-05 22:00:00',
    isPublished: 1,
    publishedAt: '2026-09-15 16:00:00',
    venueName: 'La Rural — Pabellón Azul',
    venueAddress: 'Av. Sarmiento 2704',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1425',
    googleMapsUrl: null,
    maxCapacity: 2500,
    lineup: null,
    posterSeed: 'expo-vinos',
    mapSeed: 'expo-vinos-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430e',
    name: 'Batalla de Freestyle — Regional BA',
    slug: 'freestyle-regional-ba-demo',
    description:
      'Octavos, cuartos y final en una sola noche. Jurado presencial y transmisión en pantallas laterales.',
    startDate: '2026-11-14 19:00:00',
    endDate: '2026-11-15 01:00:00',
    isPublished: 1,
    publishedAt: '2026-09-08 19:00:00',
    venueName: 'Luna Park',
    venueAddress: 'Av. Eduardo Madero 420',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1106',
    googleMapsUrl: null,
    maxCapacity: 7500,
    lineup: ['MCs regionales', 'Invitados nacionales'],
    posterSeed: 'freestyle-ba',
    mapSeed: 'freestyle-ba-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f79430f',
    name: 'Tango Milonga Abierta',
    slug: 'tango-milonga-abierta-demo',
    description:
      'Orquesta en vivo y pista libre. Clase introductoria a las 21; milonga desde las 22. Código de vestimenta sugerido.',
    startDate: '2026-10-17 21:00:00',
    endDate: '2026-10-18 02:00:00',
    isPublished: 1,
    publishedAt: '2026-09-02 10:00:00',
    venueName: 'Salon Canning',
    venueAddress: 'Av. Scalabrini Ortiz 1331',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1414',
    googleMapsUrl: null,
    maxCapacity: 400,
    lineup: ['Orquesta Típica Demo'],
    posterSeed: 'milonga-canning',
    mapSeed: 'milonga-canning-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794310',
    name: 'Hackathon Ciudad Inteligente',
    slug: 'hackathon-ciudad-inteligente-demo',
    description:
      '48 horas para prototipar soluciones urbanas. Mentores, kits IoT y premios en efectivo. Inscripción por equipo.',
    startDate: '2026-11-28 09:00:00',
    endDate: '2026-11-30 18:00:00',
    isPublished: 0,
    publishedAt: null,
    venueName: 'Distrito Tecnológico',
    venueAddress: 'Av. San Juan 350',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1147',
    googleMapsUrl: null,
    maxCapacity: 600,
    lineup: null,
    posterSeed: 'hackathon-ba',
    mapSeed: 'hackathon-ba-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794311',
    name: 'Fiesta de Fin de Año — Dock Sur',
    slug: 'fiesta-fin-de-ano-dock-demo',
    description:
      'Cuenta regresiva con dos salas (main + chill), fuegos artificiales a las 00:00 y transporte de regreso incluido.',
    startDate: '2026-12-31 22:00:00',
    endDate: '2027-01-01 06:00:00',
    isPublished: 1,
    publishedAt: '2026-09-20 12:00:00',
    venueName: 'Dock del Plata',
    venueAddress: 'Av. Elvira Rawson de Dellepiane 150',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1107',
    googleMapsUrl: null,
    maxCapacity: 3500,
    lineup: ['Headliner TBA', 'Local openers'],
    posterSeed: 'nye-dock',
    mapSeed: 'nye-dock-map',
    ticketTypes: [
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794306', name: 'Preventa', price: '45000.00', quantity: 1000, sortOrder: 0 },
      { uuid: 'c04cef15-29a8-430a-90be-6a7d4f794307', name: 'VIP', price: '85000.00', quantity: 300, sortOrder: 1 }
    ]
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794312',
    name: 'Obra de Teatro — “La Última Función”',
    slug: 'obra-ultima-funcion-demo',
    description:
      'Drama contemporáneo en tres actos. Funciones de viernes y sábado. Descuentos para estudiantes con acreditación.',
    startDate: '2026-08-15 21:00:00',
    endDate: '2026-08-15 23:15:00',
    isPublished: 1,
    publishedAt: '2026-07-01 10:00:00',
    venueName: 'Teatro San Martín',
    venueAddress: 'Av. Corrientes 1530',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1042',
    googleMapsUrl: null,
    maxCapacity: 900,
    lineup: null,
    posterSeed: 'teatro-funcion',
    mapSeed: 'teatro-funcion-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794313',
    name: 'Meetup Productores Culturales',
    slug: 'meetup-productores-demo',
    description:
      'Networking y panel sobre ticketing, sponsors y logística. Coffee break incluido. Cupo reducido.',
    startDate: '2026-07-22 18:00:00',
    endDate: '2026-07-22 21:00:00',
    isPublished: 1,
    publishedAt: '2026-06-10 09:00:00',
    venueName: 'WeWork Torre Bouchard',
    venueAddress: 'Bouchard 710',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1106',
    googleMapsUrl: null,
    maxCapacity: 120,
    lineup: null,
    posterSeed: 'meetup-productores',
    mapSeed: 'meetup-productores-map'
  },
  {
    uuid: 'b04cef15-29a8-430a-90be-6a7d4f794314',
    name: 'Brunch & Jazz en San Telmo',
    slug: 'brunch-jazz-san-telmo-demo',
    description:
      'Menú degustación + trío de jazz en vivo. Reservas por mesa de 2 o 4. Señas no reembolsables.',
    startDate: '2026-08-03 11:30:00',
    endDate: '2026-08-03 15:00:00',
    isPublished: 1,
    publishedAt: '2026-07-05 11:00:00',
    venueName: 'Patio del Abasto Sur',
    venueAddress: 'Defensa 980',
    venueCity: 'Buenos Aires',
    venuePostalCode: '1065',
    googleMapsUrl: null,
    maxCapacity: 180,
    lineup: ['Trío Blue Note BA'],
    posterSeed: 'brunch-jazz',
    mapSeed: 'brunch-jazz-map'
  }
];

function posterUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/800/1000`;
}

function mapUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/1200/800`;
}

function bannerUrl(seed: string): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}-banner/1600/900`;
}

export class SeedProducerScrollDemoEvents1785890000000 implements MigrationInterface {
  name = 'SeedProducerScrollDemoEvents1785890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const orgs: Array<{ organizationUuid: string }> = await queryRunner.query(
      `
        SELECT uo.\`organizationUuid\` AS organizationUuid
        FROM \`user_organization\` uo
        INNER JOIN \`organization\` o ON o.\`uuid\` = uo.\`organizationUuid\` AND o.\`isDeleted\` IS NULL
        WHERE uo.\`userUuid\` = ?
          AND uo.\`isDeleted\` IS NULL
        ORDER BY uo.\`createdAt\` ASC
        LIMIT 1
      `,
      [OWNER_USER_UUID]
    );

    const organizationUuid = orgs[0]?.organizationUuid as string | undefined;
    if (!organizationUuid) {
      // Sin membresía no insertamos: evita FK rotas en entornos sin ese user.
      return;
    }

    for (const event of DEMO_EVENTS) {
      const existing: Array<{ uuid: string }> = await queryRunner.query(
        `SELECT \`uuid\` FROM \`event\` WHERE \`uuid\` = ? LIMIT 1`,
        [event.uuid]
      );
      if (existing.length > 0) continue;

      const lineupJson = event.lineup ? JSON.stringify(event.lineup) : null;
      const banner = bannerUrl(event.posterSeed);
      const bannerImages = JSON.stringify({ desktop: banner, mobile: banner, thumbnail: banner });

      await queryRunner.query(
        `
          INSERT INTO \`event\` (
            \`uuid\`, \`name\`, \`description\`, \`slug\`, \`bannerUrl\`, \`bannerImages\`,
            \`startDate\`, \`endDate\`, \`saleStartDate\`, \`saleEndDate\`,
            \`isPublished\`, \`publishedAt\`, \`cancelledAt\`, \`cancellationReason\`, \`salesClosedAt\`,
            \`isActive\`, \`organizationUuid\`,
            \`venueName\`, \`venueAddress\`, \`venueCity\`, \`venueCountry\`, \`venuePostalCode\`,
            \`googleMapsUrl\`, \`lineup\`, \`maxCapacity\`
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, NULL, NULL,
            ?, ?, NULL, NULL, NULL,
            1, ?,
            ?, ?, ?, 'Argentina', ?,
            ?, CAST(? AS JSON), ?
          )
        `,
        [
          event.uuid,
          event.name,
          event.description,
          event.slug,
          banner,
          bannerImages,
          event.startDate,
          event.endDate,
          event.isPublished,
          event.publishedAt,
          organizationUuid,
          event.venueName,
          event.venueAddress,
          event.venueCity,
          event.venuePostalCode,
          event.googleMapsUrl,
          lineupJson,
          event.maxCapacity
        ]
      );

      const mediaUuid = event.uuid.replace(/^b04/, 'd04');
      await queryRunner.query(
        `
          INSERT INTO \`event_media\` (
            \`uuid\`, \`eventUuid\`, \`sortOrder\`, \`kind\`, \`url\`, \`mimeType\`, \`createdBy\`
          ) VALUES (?, ?, 0, 'image', ?, 'image/jpeg', ?)
        `,
        [mediaUuid, event.uuid, posterUrl(event.posterSeed), OWNER_USER_UUID]
      );

      const mapUuid = event.uuid.replace(/^b04/, 'e04');
      await queryRunner.query(
        `
          INSERT INTO \`event_map\` (
            \`uuid\`, \`eventUuid\`, \`name\`, \`baseImageUrl\`, \`canvasWidth\`, \`canvasHeight\`, \`createdBy\`
          ) VALUES (?, ?, 'Mapa principal', ?, 1200, 800, ?)
        `,
        [mapUuid, event.uuid, mapUrl(event.mapSeed), OWNER_USER_UUID]
      );

      for (const tt of event.ticketTypes ?? []) {
        await queryRunner.query(
          `
            INSERT INTO \`ticket_type\` (
              \`uuid\`, \`eventUuid\`, \`name\`, \`description\`, \`price\`, \`currency\`,
              \`quantity\`, \`availableQuantity\`, \`minPerOrder\`, \`maxPerOrder\`,
              \`saleStartDate\`, \`saleEndDate\`, \`isActive\`, \`sortOrder\`
            ) VALUES (
              ?, ?, ?, NULL, ?, 'ARS',
              ?, ?, 1, 8,
              NULL, NULL, 1, ?
            )
          `,
          [tt.uuid, event.uuid, tt.name, tt.price, tt.quantity, tt.quantity, tt.sortOrder]
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const eventUuids = DEMO_EVENTS.map(e => e.uuid);
    const placeholders = eventUuids.map(() => '?').join(', ');

    const ticketUuids = DEMO_EVENTS.flatMap(e => (e.ticketTypes ?? []).map(t => t.uuid));
    if (ticketUuids.length > 0) {
      await queryRunner.query(
        `DELETE FROM \`ticket_type\` WHERE \`uuid\` IN (${ticketUuids.map(() => '?').join(', ')})`,
        ticketUuids
      );
    }

    await queryRunner.query(
      `DELETE FROM \`event_map\` WHERE \`eventUuid\` IN (${placeholders})`,
      eventUuids
    );
    await queryRunner.query(
      `DELETE FROM \`event_media\` WHERE \`eventUuid\` IN (${placeholders})`,
      eventUuids
    );
    await queryRunner.query(`DELETE FROM \`event\` WHERE \`uuid\` IN (${placeholders})`, eventUuids);
  }
}
