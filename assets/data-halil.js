(window.ALL_SCHEDULES = window.ALL_SCHEDULES || []);
window.SCHEDULE = {
  teacher: "Halil İbrahim Eriş",
  program: [
    // Salı (ortaokul saatleri, 35 dk)
    { gun: 2, bas: "09:50", bit: "10:25", ad: "7B", lab: "L", kademe: "ortaokul" },
    { gun: 2, bas: "10:40", bit: "11:15", ad: "7A", lab: "L", kademe: "ortaokul" },
    { gun: 2, bas: "11:25", bit: "12:00", ad: "6A", lab: "L", kademe: "ortaokul" },
    { gun: 2, bas: "12:10", bit: "12:45", ad: "6A", lab: "L", kademe: "ortaokul" },
    { gun: 2, bas: "14:00", bit: "14:35", ad: "6B", lab: "O", kademe: "ortaokul" },
    { gun: 2, bas: "14:45", bit: "15:20", ad: "6B", lab: "O", kademe: "ortaokul" },
    { gun: 2, bas: "15:40", bit: "16:15", ad: "6D", lab: "O", kademe: "ortaokul" },
    { gun: 2, bas: "16:25", bit: "17:00", ad: "6D", lab: "O", kademe: "ortaokul" },
    // Çarşamba
    { gun: 3, bas: "09:00", bit: "09:35", ad: "7E",       lab: "O", kademe: "ortaokul" },
    { gun: 3, bas: "12:10", bit: "12:45", ad: "6C",       lab: "L", kademe: "ortaokul" },
    { gun: 3, bas: "14:00", bit: "14:35", ad: "7C",       lab: "L", kademe: "ortaokul" },
    { gun: 3, bas: "14:45", bit: "15:20", ad: "7D",       lab: "L", kademe: "ortaokul" },
    { gun: 3, bas: "15:40", bit: "16:15", ad: "Toplantı", lab: "",  kademe: "toplanti" },
    { gun: 3, bas: "16:25", bit: "17:00", ad: "6C",       lab: "L", kademe: "ortaokul" },
    // Perşembe
    { gun: 4, bas: "12:20", bit: "12:55", ad: "10/Fen-A", lab: "L", kademe: "lise" },
    { gun: 4, bas: "15:25", bit: "16:00", ad: "Amazing",  lab: "i", kademe: "amazing" },
    // Cuma
    { gun: 5, bas: "14:15", bit: "14:50", ad: "10/AND-A", lab: "L", kademe: "lise" },
    { gun: 5, bas: "15:00", bit: "15:35", ad: "10/AND-B", lab: "L", kademe: "lise" },
  ],
};
window.ALL_SCHEDULES.push(window.SCHEDULE);
