"""Curated landing sites.

South-pole sites lie inside the LOLA DEM, so they get a real terrain horizon.
Where a named region has no single published point, we use the highest LOLA
point in that region (noted in `source`) — that is where a lander would
actually be placed for light and line-of-sight.
Reference sites further north use a smooth-sphere horizon.
"""

SITES = [
    # --- South pole: terrain-aware -------------------------------------------
    {
        "id": "connecting-ridge",
        "name": "Shackleton connecting ridge",
        "lat": -89.45, "lon": 222.69,
        "group": "South pole",
        "note": "Ridge between Shackleton and de Gerlache craters; among the best-lit spots on the Moon.",
        "source": "Highly illuminated point from LOLA illumination studies (Mazarico et al. 2011)",
    },
    {
        "id": "de-gerlache-rim",
        "name": "de Gerlache crater rim",
        "lat": -88.665, "lon": 291.812,
        "group": "South pole",
        "note": "Artemis III candidate region de Gerlache Rim.",
        "source": "Highest LOLA point on the rim",
    },
    {
        "id": "malapert-massif",
        "name": "Malapert Massif summit",
        "lat": -85.99, "lon": 2.1,
        "group": "South pole",
        "note": "~5 km tall massif facing Earth; Artemis III candidate region.",
        "source": "Highest LOLA point of the massif",
    },
    {
        "id": "mons-mouton",
        "name": "Mons Mouton summit",
        "lat": -84.666, "lon": 39.466,
        "group": "South pole",
        "note": "Flat-topped mountain; Artemis III candidate region near the IM-2 target area.",
        "source": "Highest LOLA point of the mountain",
    },
    {
        "id": "im-1",
        "name": "IM-1 Odysseus (2024)",
        "lat": -80.13, "lon": 1.44,
        "group": "South pole",
        "note": "First US landing since Apollo (Intuitive Machines, Feb 2024, near Malapert A). It came down on a ~12° slope, caught a leg and tipped onto its side; compare the slope here.",
        "source": "Published landing site",
    },
    {
        "id": "south-pole",
        "name": "Geographic south pole",
        "lat": -89.999, "lon": 0.0,
        "group": "South pole",
        "note": "The pole itself sits on the rim of Shackleton crater.",
        "source": "Definition",
    },
    {
        "id": "shackleton-floor",
        "name": "Shackleton crater floor",
        "lat": -89.66, "lon": 129.2,
        "group": "South pole",
        "note": "Permanently shadowed region: water ice, but no sunlight and no Earth.",
        "source": "Crater centre; LOLA floor ~4 km below the rim",
    },
    # --- Reference sites: smooth horizon ------------------------------------
    {
        "id": "apollo-11", "name": "Apollo 11 (1969)",
        "lat": 0.6741, "lon": 23.4730, "group": "Reference",
        "note": "Equatorial near side: 14 days of light, 14 of night, Earth always overhead.",
        "source": "Published landing site",
    },
    {
        "id": "apollo-17", "name": "Apollo 17 (1972)",
        "lat": 20.1908, "lon": 30.7717, "group": "Reference",
        "note": "Taurus-Littrow valley.",
        "source": "Published landing site",
    },
    {
        "id": "chandrayaan-3", "name": "Chandrayaan-3, Shiv Shakti Point (2023)",
        "lat": -69.373, "lon": 32.319, "group": "Reference",
        "note": "ISRO's high-southern-latitude landing.",
        "source": "Published landing site",
    },
    {
        "id": "slim", "name": "SLIM (2024)",
        "lat": -13.316, "lon": 25.251, "group": "Reference",
        "note": "JAXA precision lander that survived several lunar nights.",
        "source": "Published landing site",
    },
    {
        "id": "blue-ghost-1", "name": "Blue Ghost Mission 1 (2025)",
        "lat": 18.5622, "lon": 61.8106, "group": "Reference",
        "note": "Firefly CLPS lander in Mare Crisium.",
        "source": "Published landing site",
    },
    {
        "id": "change-4", "name": "Chang'e-4 (2019)",
        "lat": -45.4446, "lon": 177.5991, "group": "Reference",
        "note": "Far side: Earth never rises, so it needed the Queqiao relay satellite.",
        "source": "Published landing site",
    },
]

BY_ID = {s["id"]: s for s in SITES}
