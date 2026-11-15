export const DESIGNS = [
  {
    id: "trainer",
    name: "آموزشی",
    color: "#ffd6ea",
    accent: "#ffd27a",
    root: {
      part: "capsule",
      children: [
        { part: "chute" },
        {
          part: "tank-s",
          children: [
            {
              part: "kero-s",
              children: [
                { part: "fin", radial: -1 },
                { part: "fin", radial: 1 }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: "orbital",
    name: "مدارگرد",
    color: "#ffe8f4",
    accent: "#c9a7ff",
    root: {
      part: "probe",
      children: [
        {
          part: "tank-h",
          children: [
            { part: "hydro" },
            {
              part: "decoupler",
              children: [
                {
                  part: "tank-l",
                  children: [
                    {
                      part: "kero",
                      children: [
                        { part: "fin", radial: -1 },
                        { part: "fin", radial: 1 }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: "boosted",
    name: "بوستر‌دار",
    color: "#fff4e6",
    accent: "#ff8fc2",
    root: {
      part: "capsule",
      children: [
        { part: "chute" },
        {
          part: "tank-m",
          children: [
            { part: "kero-s" },
            {
              part: "decoupler",
              children: [
                {
                  part: "tank-m",
                  children: [
                    {
                      part: "kero",
                      children: [
                        { part: "fin", radial: -1 },
                        { part: "fin", radial: 1 }
                      ]
                    },
                    { part: "decoupler", radial: -1, children: [{ part: "srb" }] },
                    { part: "decoupler", radial: 1, children: [{ part: "srb" }] }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  },
  {
    id: "sat",
    name: "ماهواره‌بر",
    color: "#f6ecff",
    accent: "#9be7d4",
    root: {
      part: "sat-com",
      children: [
        { part: "solar" },
        { part: "battery" },
        { part: "antenna" },
        { part: "fairing" },
        {
          part: "tank-h",
          children: [
            { part: "hydro" },
            {
              part: "decoupler",
              children: [
                {
                  part: "tank-l",
                  children: [
                    {
                      part: "kero",
                      children: [
                        { part: "fin", radial: -1 },
                        { part: "fin", radial: 1 }
                      ]
                    },
                    { part: "kero", radial: -1 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
];
