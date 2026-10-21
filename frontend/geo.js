/* =====================================================
   DealBriz — location helpers

   Listings store only a 6-digit pincode, never coordinates. Indian PIN
   codes are hierarchical, so the first 3 digits identify a sorting
   district (roughly a city/district). That gives us two things without
   any geocoding service:

     1. "Nearby" filtering — /api/buy?pincode=160 is already a prefix
        match on the server, so it returns the whole district.
     2. Approximate map positions — each district has a known centre, and
        a listing is drawn near that centre.

   Map positions are therefore APPROXIMATE — they show the area a listing
   is in, not a seller's address. That is deliberate: publishing exact
   home locations of private sellers on a public map would be unsafe.
   ===================================================== */

// prefix: the 3-digit district code used for both filtering and centring.
const DB_AREAS = [
  // ---- Punjab / Chandigarh / Haryana / HP / J&K (north) ----
  { name: 'Chandigarh',   district: 'Chandigarh',         state: 'Chandigarh',      prefix: '160', lat: 30.7333, lng: 76.7794 },
  { name: 'Mohali',       district: 'SAS Nagar',          state: 'Punjab',          prefix: '140', lat: 30.7046, lng: 76.7179 },
  { name: 'Ludhiana',     district: 'Ludhiana',           state: 'Punjab',          prefix: '141', lat: 30.9010, lng: 75.8573 },
  { name: 'Amritsar',     district: 'Amritsar',           state: 'Punjab',          prefix: '143', lat: 31.6340, lng: 74.8723 },
  { name: 'Jalandhar',    district: 'Jalandhar',          state: 'Punjab',          prefix: '144', lat: 31.3260, lng: 75.5762 },
  { name: 'Bathinda',     district: 'Bathinda',           state: 'Punjab',          prefix: '151', lat: 30.2110, lng: 74.9455 },
  { name: 'Patiala',      district: 'Patiala',            state: 'Punjab',          prefix: '147', lat: 30.3398, lng: 76.3869 },
  { name: 'Pathankot',    district: 'Pathankot',          state: 'Punjab',          prefix: '145', lat: 32.2643, lng: 75.6421 },
  { name: 'Panchkula',    district: 'Panchkula',          state: 'Haryana',         prefix: '134', lat: 30.6942, lng: 76.8606 },
  { name: 'Ambala',       district: 'Ambala',             state: 'Haryana',         prefix: '133', lat: 30.3752, lng: 76.7821 },
  { name: 'Karnal',       district: 'Karnal',             state: 'Haryana',         prefix: '132', lat: 29.6857, lng: 76.9905 },
  { name: 'Faridabad',    district: 'Faridabad',          state: 'Haryana',         prefix: '121', lat: 28.4089, lng: 77.3178 },
  { name: 'Gurugram',     district: 'Gurugram',           state: 'Haryana',         prefix: '122', lat: 28.4595, lng: 77.0266 },
  { name: 'Hisar',        district: 'Hisar',              state: 'Haryana',         prefix: '125', lat: 29.1492, lng: 75.7217 },
  { name: 'Rohtak',       district: 'Rohtak',             state: 'Haryana',         prefix: '124', lat: 28.8955, lng: 76.6066 },
  // ---- Himachal Pradesh — deep coverage, first launch state ----
  // Shimla district
  { name: 'Shimla',        district: 'Shimla',    state: 'Himachal Pradesh', prefix: '171', lat: 31.1048, lng: 77.1734 },
  { name: 'Rohru',         district: 'Shimla',    state: 'Himachal Pradesh', prefix: '171', lat: 31.2043, lng: 77.7488 },
  { name: 'Theog',         district: 'Shimla',    state: 'Himachal Pradesh', prefix: '171', lat: 31.1236, lng: 77.3444 },
  { name: 'Rampur Bushahr',district: 'Shimla',    state: 'Himachal Pradesh', prefix: '172', lat: 31.4508, lng: 77.6350 },
  // Kinnaur district
  { name: 'Reckong Peo',   district: 'Kinnaur',   state: 'Himachal Pradesh', prefix: '172', lat: 31.5467, lng: 78.2634 },
  { name: 'Kalpa',         district: 'Kinnaur',   state: 'Himachal Pradesh', prefix: '172', lat: 31.5397, lng: 78.2586 },
  // Lahaul & Spiti district
  { name: 'Keylong',       district: 'Lahaul & Spiti', state: 'Himachal Pradesh', prefix: '175', lat: 32.5711, lng: 77.0299 },
  { name: 'Kaza',          district: 'Lahaul & Spiti', state: 'Himachal Pradesh', prefix: '172', lat: 32.2246, lng: 78.0714 },
  // Solan district
  { name: 'Solan',         district: 'Solan',     state: 'Himachal Pradesh', prefix: '173', lat: 30.9045, lng: 77.0967 },
  { name: 'Kasauli',       district: 'Solan',     state: 'Himachal Pradesh', prefix: '173', lat: 30.8985, lng: 76.9653 },
  { name: 'Parwanoo',      district: 'Solan',     state: 'Himachal Pradesh', prefix: '173', lat: 30.8377, lng: 76.9614 },
  { name: 'Nalagarh',      district: 'Solan',     state: 'Himachal Pradesh', prefix: '174', lat: 31.0503, lng: 76.7213 },
  // Sirmaur district
  { name: 'Nahan',         district: 'Sirmaur',   state: 'Himachal Pradesh', prefix: '173', lat: 30.5590, lng: 77.2934 },
  { name: 'Paonta Sahib',  district: 'Sirmaur',   state: 'Himachal Pradesh', prefix: '173', lat: 30.4384, lng: 77.6250 },
  { name: 'Rajgarh',       district: 'Sirmaur',   state: 'Himachal Pradesh', prefix: '173', lat: 30.8347, lng: 77.2903 },
  // Bilaspur district
  { name: 'Bilaspur',      district: 'Bilaspur',  state: 'Himachal Pradesh', prefix: '174', lat: 31.3350, lng: 76.7570 },
  { name: 'Ghumarwin',     district: 'Bilaspur',  state: 'Himachal Pradesh', prefix: '174', lat: 31.4363, lng: 76.7093 },
  // Una district
  { name: 'Una',           district: 'Una',       state: 'Himachal Pradesh', prefix: '174', lat: 31.4685, lng: 76.2708 },
  { name: 'Santokhgarh',   district: 'Una',       state: 'Himachal Pradesh', prefix: '174', lat: 31.5167, lng: 76.3167 },
  // Hamirpur district
  { name: 'Hamirpur',      district: 'Hamirpur',  state: 'Himachal Pradesh', prefix: '177', lat: 31.6862, lng: 76.5217 },
  { name: 'Nadaun',        district: 'Hamirpur',  state: 'Himachal Pradesh', prefix: '177', lat: 31.7833, lng: 76.3500 },
  // Kangra district
  { name: 'Kangra',        district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 32.0998, lng: 76.2691 },
  { name: 'Dharamshala',   district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 32.2190, lng: 76.3234 },
  { name: 'Palampur',      district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 32.1109, lng: 76.5363 },
  { name: 'Nurpur',        district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 32.2985, lng: 75.9014 },
  { name: 'Jawalamukhi',   district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 31.8734, lng: 76.3236 },
  { name: 'Baijnath',      district: 'Kangra',    state: 'Himachal Pradesh', prefix: '176', lat: 32.0500, lng: 76.6500 },
  // Mandi district
  { name: 'Mandi',         district: 'Mandi',     state: 'Himachal Pradesh', prefix: '175', lat: 31.7080, lng: 76.9318 },
  { name: 'Sundernagar',   district: 'Mandi',     state: 'Himachal Pradesh', prefix: '175', lat: 31.5330, lng: 76.9040 },
  { name: 'Jogindernagar', district: 'Mandi',     state: 'Himachal Pradesh', prefix: '175', lat: 31.9880, lng: 76.7880 },
  // Kullu district
  { name: 'Kullu',         district: 'Kullu',     state: 'Himachal Pradesh', prefix: '175', lat: 31.9576, lng: 77.1095 },
  { name: 'Manali',        district: 'Kullu',     state: 'Himachal Pradesh', prefix: '175', lat: 32.2432, lng: 77.1892 },
  { name: 'Banjar',        district: 'Kullu',     state: 'Himachal Pradesh', prefix: '175', lat: 31.6367, lng: 77.3417 },
  // Chamba district
  { name: 'Chamba',        district: 'Chamba',    state: 'Himachal Pradesh', prefix: '176', lat: 32.5560, lng: 76.1260 },
  { name: 'Dalhousie',     district: 'Chamba',    state: 'Himachal Pradesh', prefix: '176', lat: 32.5387, lng: 75.9700 },
  { name: 'Bharmour',      district: 'Chamba',    state: 'Himachal Pradesh', prefix: '176', lat: 32.4472, lng: 76.5347 },
  { name: 'Jammu',        district: 'Jammu',              state: 'Jammu & Kashmir', prefix: '180', lat: 32.7266, lng: 74.8570 },
  { name: 'Srinagar',     district: 'Srinagar',           state: 'Jammu & Kashmir', prefix: '190', lat: 34.0837, lng: 74.7973 },
  { name: 'Dehradun',     district: 'Dehradun',           state: 'Uttarakhand',     prefix: '248', lat: 30.3165, lng: 78.0322 },
  { name: 'Haridwar',     district: 'Haridwar',           state: 'Uttarakhand',     prefix: '249', lat: 29.9457, lng: 78.1642 },

  // ---- Delhi NCR & Uttar Pradesh ----
  { name: 'New Delhi',    district: 'New Delhi',          state: 'Delhi',           prefix: '110', lat: 28.6139, lng: 77.2090 },
  { name: 'Noida',        district: 'Gautam Buddh Nagar', state: 'Uttar Pradesh',   prefix: '201', lat: 28.5355, lng: 77.3910 },
  { name: 'Ghaziabad',    district: 'Ghaziabad',          state: 'Uttar Pradesh',   prefix: '245', lat: 28.6692, lng: 77.4538 },
  { name: 'Meerut',       district: 'Meerut',             state: 'Uttar Pradesh',   prefix: '250', lat: 28.9845, lng: 77.7064 },
  { name: 'Agra',         district: 'Agra',               state: 'Uttar Pradesh',   prefix: '282', lat: 27.1767, lng: 78.0081 },
  { name: 'Mathura',      district: 'Mathura',            state: 'Uttar Pradesh',   prefix: '281', lat: 27.4924, lng: 77.6737 },
  { name: 'Aligarh',      district: 'Aligarh',            state: 'Uttar Pradesh',   prefix: '202', lat: 27.8974, lng: 78.0880 },
  { name: 'Bareilly',     district: 'Bareilly',           state: 'Uttar Pradesh',   prefix: '243', lat: 28.3670, lng: 79.4304 },
  { name: 'Lucknow',      district: 'Lucknow',            state: 'Uttar Pradesh',   prefix: '226', lat: 26.8467, lng: 80.9462 },
  { name: 'Kanpur',       district: 'Kanpur Nagar',       state: 'Uttar Pradesh',   prefix: '208', lat: 26.4499, lng: 80.3319 },
  { name: 'Varanasi',     district: 'Varanasi',           state: 'Uttar Pradesh',   prefix: '221', lat: 25.3176, lng: 82.9739 },
  { name: 'Prayagraj',    district: 'Prayagraj',          state: 'Uttar Pradesh',   prefix: '211', lat: 25.4358, lng: 81.8463 },
  { name: 'Gorakhpur',    district: 'Gorakhpur',          state: 'Uttar Pradesh',   prefix: '273', lat: 26.7606, lng: 83.3732 },

  // ---- Rajasthan / Gujarat / MP ----
  { name: 'Jaipur',       district: 'Jaipur',             state: 'Rajasthan',       prefix: '302', lat: 26.9124, lng: 75.7873 },
  { name: 'Jodhpur',      district: 'Jodhpur',            state: 'Rajasthan',       prefix: '342', lat: 26.2389, lng: 73.0243 },
  { name: 'Udaipur',      district: 'Udaipur',            state: 'Rajasthan',       prefix: '313', lat: 24.5854, lng: 73.7125 },
  { name: 'Kota',         district: 'Kota',               state: 'Rajasthan',       prefix: '324', lat: 25.2138, lng: 75.8648 },
  { name: 'Ajmer',        district: 'Ajmer',              state: 'Rajasthan',       prefix: '305', lat: 26.4499, lng: 74.6399 },
  { name: 'Bikaner',      district: 'Bikaner',            state: 'Rajasthan',       prefix: '334', lat: 28.0229, lng: 73.3119 },
  { name: 'Ahmedabad',    district: 'Ahmedabad',          state: 'Gujarat',         prefix: '380', lat: 23.0225, lng: 72.5714 },
  { name: 'Surat',        district: 'Surat',              state: 'Gujarat',         prefix: '395', lat: 21.1702, lng: 72.8311 },
  { name: 'Vadodara',     district: 'Vadodara',           state: 'Gujarat',         prefix: '390', lat: 22.3072, lng: 73.1812 },
  { name: 'Rajkot',       district: 'Rajkot',             state: 'Gujarat',         prefix: '360', lat: 22.3039, lng: 70.8022 },
  { name: 'Gandhinagar',  district: 'Gandhinagar',        state: 'Gujarat',         prefix: '382', lat: 23.2156, lng: 72.6369 },
  { name: 'Bhopal',       district: 'Bhopal',             state: 'Madhya Pradesh',  prefix: '462', lat: 23.2599, lng: 77.4126 },
  { name: 'Indore',       district: 'Indore',             state: 'Madhya Pradesh',  prefix: '452', lat: 22.7196, lng: 75.8577 },
  { name: 'Gwalior',      district: 'Gwalior',            state: 'Madhya Pradesh',  prefix: '474', lat: 26.2183, lng: 78.1828 },
  { name: 'Jabalpur',     district: 'Jabalpur',           state: 'Madhya Pradesh',  prefix: '482', lat: 23.1815, lng: 79.9864 },
  { name: 'Raipur',       district: 'Raipur',             state: 'Chhattisgarh',    prefix: '492', lat: 21.2514, lng: 81.6296 },

  // ---- Maharashtra / Goa ----
  { name: 'Mumbai',       district: 'Mumbai',             state: 'Maharashtra',     prefix: '400', lat: 19.0760, lng: 72.8777 },
  { name: 'Thane',        district: 'Thane',              state: 'Maharashtra',     prefix: '401', lat: 19.2183, lng: 72.9781 },
  { name: 'Navi Mumbai',  district: 'Thane',              state: 'Maharashtra',     prefix: '410', lat: 19.0330, lng: 73.0297 },
  { name: 'Pune',         district: 'Pune',               state: 'Maharashtra',     prefix: '411', lat: 18.5204, lng: 73.8567 },
  { name: 'Nashik',       district: 'Nashik',             state: 'Maharashtra',     prefix: '422', lat: 19.9975, lng: 73.7898 },
  { name: 'Nagpur',       district: 'Nagpur',             state: 'Maharashtra',     prefix: '440', lat: 21.1458, lng: 79.0882 },
  { name: 'Aurangabad',   district: 'Aurangabad',         state: 'Maharashtra',     prefix: '431', lat: 19.8762, lng: 75.3433 },
  { name: 'Kolhapur',     district: 'Kolhapur',           state: 'Maharashtra',     prefix: '416', lat: 16.7050, lng: 74.2433 },
  { name: 'Panaji',       district: 'North Goa',          state: 'Goa',             prefix: '403', lat: 15.4909, lng: 73.8278 },

  // ---- South ----
  { name: 'Bengaluru',    district: 'Bengaluru Urban',    state: 'Karnataka',       prefix: '560', lat: 12.9716, lng: 77.5946 },
  { name: 'Mysuru',       district: 'Mysuru',             state: 'Karnataka',       prefix: '570', lat: 12.2958, lng: 76.6394 },
  { name: 'Mangaluru',    district: 'Dakshina Kannada',   state: 'Karnataka',       prefix: '575', lat: 12.9141, lng: 74.8560 },
  { name: 'Hubballi',     district: 'Dharwad',            state: 'Karnataka',       prefix: '580', lat: 15.3647, lng: 75.1240 },
  { name: 'Hyderabad',    district: 'Hyderabad',          state: 'Telangana',       prefix: '500', lat: 17.3850, lng: 78.4867 },
  { name: 'Warangal',     district: 'Warangal',           state: 'Telangana',       prefix: '506', lat: 17.9689, lng: 79.5941 },
  { name: 'Visakhapatnam',district: 'Visakhapatnam',      state: 'Andhra Pradesh',  prefix: '530', lat: 17.6868, lng: 83.2185 },
  { name: 'Vijayawada',   district: 'Krishna',            state: 'Andhra Pradesh',  prefix: '520', lat: 16.5062, lng: 80.6480 },
  { name: 'Tirupati',     district: 'Tirupati',           state: 'Andhra Pradesh',  prefix: '517', lat: 13.6288, lng: 79.4192 },
  { name: 'Chennai',      district: 'Chennai',            state: 'Tamil Nadu',      prefix: '600', lat: 13.0827, lng: 80.2707 },
  { name: 'Coimbatore',   district: 'Coimbatore',         state: 'Tamil Nadu',      prefix: '641', lat: 11.0168, lng: 76.9558 },
  { name: 'Madurai',      district: 'Madurai',            state: 'Tamil Nadu',      prefix: '625', lat: 9.9252,  lng: 78.1198 },
  { name: 'Tiruchirappalli', district: 'Tiruchirappalli', state: 'Tamil Nadu',      prefix: '620', lat: 10.7905, lng: 78.7047 },
  { name: 'Salem',        district: 'Salem',              state: 'Tamil Nadu',      prefix: '636', lat: 11.6643, lng: 78.1460 },
  { name: 'Kochi',        district: 'Ernakulam',          state: 'Kerala',          prefix: '682', lat: 9.9312,  lng: 76.2673 },
  { name: 'Thiruvananthapuram', district: 'Thiruvananthapuram', state: 'Kerala',    prefix: '695', lat: 8.5241,  lng: 76.9366 },
  { name: 'Kozhikode',    district: 'Kozhikode',          state: 'Kerala',          prefix: '673', lat: 11.2588, lng: 75.7804 },
  { name: 'Thrissur',     district: 'Thrissur',           state: 'Kerala',          prefix: '680', lat: 10.5276, lng: 76.2144 },

  // ---- East & North-East ----
  { name: 'Kolkata',      district: 'Kolkata',            state: 'West Bengal',     prefix: '700', lat: 22.5726, lng: 88.3639 },
  { name: 'Howrah',       district: 'Howrah',             state: 'West Bengal',     prefix: '711', lat: 22.5958, lng: 88.2636 },
  { name: 'Siliguri',     district: 'Darjeeling',         state: 'West Bengal',     prefix: '734', lat: 26.7271, lng: 88.3953 },
  { name: 'Durgapur',     district: 'Paschim Bardhaman',  state: 'West Bengal',     prefix: '713', lat: 23.5204, lng: 87.3119 },
  { name: 'Patna',        district: 'Patna',              state: 'Bihar',           prefix: '800', lat: 25.5941, lng: 85.1376 },
  { name: 'Gaya',         district: 'Gaya',               state: 'Bihar',           prefix: '823', lat: 24.7914, lng: 85.0002 },
  { name: 'Muzaffarpur',  district: 'Muzaffarpur',        state: 'Bihar',           prefix: '842', lat: 26.1209, lng: 85.3647 },
  { name: 'Ranchi',       district: 'Ranchi',             state: 'Jharkhand',       prefix: '834', lat: 23.3441, lng: 85.3096 },
  { name: 'Jamshedpur',   district: 'East Singhbhum',     state: 'Jharkhand',       prefix: '831', lat: 22.8046, lng: 86.2029 },
  { name: 'Dhanbad',      district: 'Dhanbad',            state: 'Jharkhand',       prefix: '826', lat: 23.7957, lng: 86.4304 },
  { name: 'Bhubaneswar',  district: 'Khordha',            state: 'Odisha',          prefix: '751', lat: 20.2961, lng: 85.8245 },
  { name: 'Cuttack',      district: 'Cuttack',            state: 'Odisha',          prefix: '753', lat: 20.4625, lng: 85.8830 },
  { name: 'Guwahati',     district: 'Kamrup Metropolitan',state: 'Assam',           prefix: '781', lat: 26.1445, lng: 91.7362 },
  { name: 'Dibrugarh',    district: 'Dibrugarh',          state: 'Assam',           prefix: '786', lat: 27.4728, lng: 94.9120 },
  { name: 'Agartala',     district: 'West Tripura',       state: 'Tripura',         prefix: '799', lat: 23.8315, lng: 91.2868 },
  { name: 'Shillong',     district: 'East Khasi Hills',   state: 'Meghalaya',       prefix: '793', lat: 25.5788, lng: 91.8933 },
  { name: 'Imphal',       district: 'Imphal West',        state: 'Manipur',         prefix: '795', lat: 24.8170, lng: 93.9368 },
];

const DB_DEFAULT_AREA = DB_AREAS[0];

/* ============================================================
   HIMACHAL PRADESH PINCODE RESOLUTION

   A 3-digit prefix is too coarse here: 175xxx alone spans Mandi,
   Kullu AND Lahaul & Spiti — three districts up to 150 km apart. So
   HP resolves in three passes, most specific first:

     1. HP_PINCODES  — exact 6-digit match for known localities
     2. HP_RANGES    — numeric ranges mapping to the right district
     3. 3-digit prefix fallback (the rest of India)

   Ranges matter more than the exact list: they mean ANY valid HP
   pincode lands in the correct district even when we don't know the
   specific post office name, instead of silently landing in the
   wrong one.
   ============================================================ */

// Exact 6-digit -> locality. Kept to post offices we can name with
// reasonable confidence; anything missing still resolves by range.
const HP_PINCODES = {
  // ---- Mandi district (1750xx) ----
  '175001': 'Mandi',            '175002': 'Mandi Bazar',
  '175005': 'Ner Chowk',        '175006': 'Ratti',
  '175008': 'Bhangrotu',        '175009': 'Kataula',
  '175011': 'Balh',             '175012': 'Bhambla',
  '175013': 'Baldwara',         '175014': 'Dharampur (Mandi)',
  '175015': 'Sarkaghat',        '175018': 'Gopalpur',
  '175019': 'Sundernagar',      '175021': 'Jogindernagar',
  '175023': 'Chauntra',         '175024': 'Padhar',
  '175025': 'Drang',            '175027': 'Aut',
  '175028': 'Pandoh',           '175029': 'Rewalsar',
  '175030': 'Bali Chowki',      '175031': 'Thunag',
  '175033': 'Janjehli',         '175035': 'Karsog',
  '175036': 'Chachiot',         '175038': 'Nihri',
  '175040': 'Dharampur',        '175045': 'Sundernagar Rural',
  '175046': 'Sunder Nagar BSL', '175047': 'Slapper',
  '175048': 'Bagsaid',          '175049': 'Gohar',
  '175050': 'Seraj',

  // ---- Kullu district (1751xx) ----
  '175101': 'Bhuntar',          '175103': 'Shamshi',
  '175105': 'Jari',             '175106': 'Manikaran',
  '175121': 'Kullu',            '175123': 'Katrain',
  '175125': 'Naggar',           '175126': 'Patlikuhal',
  '175128': 'Banjar',           '175129': 'Sainj',
  '175130': 'Larji',            '175131': 'Manali',
  '175132': 'Vashisht',         '175134': 'Nirmand',
  '175136': 'Ani',              '175138': 'Bajaura',
  '175139': 'Bhalyani',         '175140': 'Dobhi',
  '175141': 'Palchan',

  // ---- Lahaul & Spiti (1751xx tail) ----
  '175142': 'Keylong',          '175143': 'Udaipur (Lahaul)',

  // ---- Shimla district ----
  '171001': 'Shimla',           '171002': 'Chhota Shimla',
  '171003': 'Sanjauli',         '171004': 'Kasumpti',
  '171005': 'New Shimla',       '171006': 'Bharari',
  '171009': 'Summer Hill',      '171011': 'Mashobra',
  '171012': 'Dhalli',           '171101': 'Rampur Bushahr',
  '171102': 'Rohru',            '171103': 'Chirgaon',
  '171201': 'Theog',            '171202': 'Kotkhai',
  '171203': 'Jubbal',           '171207': 'Narkanda',
  '171213': 'Kumarsain',        '171225': 'Chaupal',

  // ---- Kinnaur / Spiti (172xxx) ----
  '172001': 'Rampur',           '172101': 'Nichar',
  '172104': 'Sangla',           '172107': 'Reckong Peo',
  '172108': 'Kalpa',            '172110': 'Pooh',
  '172114': 'Kaza',             '172115': 'Tabo',

  // ---- Solan / Sirmaur (173xxx) ----
  '173001': 'Nahan',            '173021': 'Rajgarh',
  '173023': 'Sarahan (Sirmaur)','173025': 'Paonta Sahib',
  '173029': 'Shillai',          '173030': 'Renuka',
  '173101': 'Kandaghat',        '173201': 'Arki',
  '173202': 'Kunihar',          '173204': 'Kasauli',
  '173205': 'Dharampur (Solan)','173206': 'Barog',
  '173209': 'Dagshai',          '173211': 'Solan Sadar',
  '173212': 'Solan',            '173213': 'Salogra',
  '173220': 'Parwanoo',         '173229': 'Baddi',
  '173230': 'Nalagarh',         '173233': 'Barotiwala',

  // ---- Bilaspur / Una (174xxx) ----
  '174001': 'Bilaspur',         '174004': 'Berthin',
  '174005': 'Namhol',           '174011': 'Jhandutta',
  '174013': 'Barmana',          '174021': 'Ghumarwin',
  '174026': 'Bharari (Bilaspur)','174029': 'Swarghat',
  '174030': 'Naina Devi',       '174032': 'Talai',
  '174101': 'Nalagarh (Rural)', '174301': 'Bangana',
  '174303': 'Una',              '174306': 'Amb',
  '174307': 'Gagret',           '174315': 'Daulatpur Chowk',
  '174316': 'Santokhgarh',      '174320': 'Haroli',

  // ---- Kangra / Chamba (176xxx) ----
  '176001': 'Kangra',           '176022': 'Nurpur',
  '176023': 'Jawali',           '176026': 'Dehra Gopipur',
  '176031': 'Jawalamukhi',      '176038': 'Nagrota Bagwan',
  '176041': 'Baijnath',         '176047': 'Bir',
  '176051': 'Sansal',           '176059': 'Bhawarna',
  '176061': 'Palampur',         '176062': 'Holta',
  '176066': 'Panchrukhi',       '176081': 'Shahpur',
  '176084': 'Dharamkot',        '176087': 'Sidhbari',
  '176101': 'Chamba',           '176102': 'Chowari',
  '176201': 'Nagrota Surian',   '176207': 'Fatehpur',
  '176208': 'Indora',           '176215': 'Dharamshala',
  '176216': 'McLeod Ganj',      '176217': 'Yol',
  '176219': 'Gaggal',           '176225': 'Kacheri',
  '176301': 'Banikhet',         '176304': 'Dalhousie',
  '176310': 'Chamba Sadar',     '176312': 'Bharmour',
  '176314': 'Salooni',          '176316': 'Tissa',
  '176318': 'Killar (Pangi)',   '176323': 'Bhattiyat',

  // ---- Hamirpur (177xxx) ----
  '177001': 'Hamirpur',         '177005': 'Bhoranj',
  '177006': 'Sujanpur Tira',    '177020': 'Nadaun',
  '177022': 'Jahu',             '177025': 'Barsar',
  '177029': 'Bijhari',          '177031': 'Galore',
  '177033': 'Dhaneta',          '177040': 'Bhota',
  '177042': 'Tauni Devi',       '177045': 'Awah Devi',
  '177101': 'Ghumarwin (Rural)','177107': 'Mehre',
  '177201': 'Chintpurni',       '177204': 'Bharwain',
  '177207': 'Ambota',           '177213': 'Thanakalan',
  '177219': 'Isapur',           '177220': 'Mubarikpur',
};

/* Numeric ranges -> district. The safety net: an HP pincode we can't name
   exactly still resolves to the right district (and therefore the right
   map position and "nearby" ranking) instead of the wrong one. */
const HP_RANGES = [
  { from: 171001, to: 171099, district: 'Shimla',            area: 'Shimla' },
  { from: 171101, to: 171129, district: 'Shimla',            area: 'Rampur Bushahr' },
  { from: 171201, to: 171299, district: 'Shimla',            area: 'Theog' },
  { from: 172001, to: 172099, district: 'Shimla',            area: 'Rampur Bushahr' },
  { from: 172101, to: 172113, district: 'Kinnaur',           area: 'Reckong Peo' },
  { from: 172114, to: 172115, district: 'Lahaul & Spiti',    area: 'Kaza' },
  { from: 172116, to: 172199, district: 'Kinnaur',           area: 'Reckong Peo' },
  { from: 173001, to: 173099, district: 'Sirmaur',           area: 'Nahan' },
  { from: 173101, to: 173199, district: 'Solan',             area: 'Solan' },
  { from: 173201, to: 173299, district: 'Solan',             area: 'Solan' },
  { from: 174001, to: 174099, district: 'Bilaspur',          area: 'Bilaspur' },
  { from: 174101, to: 174199, district: 'Solan',             area: 'Nalagarh' },
  { from: 174301, to: 174399, district: 'Una',               area: 'Una' },
  { from: 175001, to: 175099, district: 'Mandi',             area: 'Mandi' },
  { from: 175101, to: 175141, district: 'Kullu',             area: 'Kullu' },
  { from: 175142, to: 175199, district: 'Lahaul & Spiti',    area: 'Keylong' },
  { from: 176001, to: 176099, district: 'Kangra',            area: 'Kangra' },
  { from: 176101, to: 176115, district: 'Chamba',            area: 'Chamba' },
  { from: 176201, to: 176299, district: 'Kangra',            area: 'Dharamshala' },
  { from: 176301, to: 176399, district: 'Chamba',            area: 'Chamba' },
  { from: 177001, to: 177099, district: 'Hamirpur',          area: 'Hamirpur' },
  { from: 177101, to: 177199, district: 'Hamirpur',          area: 'Hamirpur' },
  { from: 177201, to: 177299, district: 'Una',               area: 'Una' },
];

/* Resolves a pincode as precisely as the data allows.
   Returns { pincode, locality, district, state, area } or null.
   `area` is the DB_AREAS entry used for map position and filtering. */
function dbLookupPincode(pincode) {
  const p = String(pincode || '').replace(/\D/g, '');
  if (p.length !== 6) return null;
  const n = parseInt(p, 10);

  const range = HP_RANGES.find(r => n >= r.from && n <= r.to);
  if (range) {
    const area = dbAreaByName(range.area) || dbAreaForPincode(p);
    return {
      pincode: p,
      locality: HP_PINCODES[p] || null,
      district: range.district,
      state: 'Himachal Pradesh',
      area: area || null,
      exact: Boolean(HP_PINCODES[p]),
    };
  }

  // Outside HP: fall back to the national 3-digit prefix map.
  const area = dbAreaForPincode(p);
  if (!area) return null;
  return {
    pincode: p, locality: null, district: area.district,
    state: area.state, area, exact: false,
  };
}

function dbAreaByPrefix(prefix) {
  return DB_AREAS.find(a => a.prefix === prefix) || null;
}

function dbAreaByName(name) {
  return DB_AREAS.find(a => a.name.toLowerCase() === String(name).toLowerCase()) || null;
}

/* The district a pincode belongs to, or null if it's outside the areas we
   have centres for (the listing still exists — it just can't be mapped). */
function dbAreaForPincode(pincode) {
  const p = String(pincode || '').replace(/\D/g, '');
  if (p.length < 3) return null;

  // A full pincode can be resolved far more precisely than its 3-digit
  // prefix. This matters most in HP, where 175xxx spans Mandi, Kullu AND
  // Lahaul & Spiti — a prefix-only lookup put every one of them in
  // whichever district happened to be listed first.
  if (p.length === 6) {
    const n = parseInt(p, 10);
    const range = HP_RANGES.find(r => n >= r.from && n <= r.to);
    if (range) {
      const area = dbAreaByName(range.area);
      if (area) return area;
    }
  }
  return dbAreaByPrefix(p.slice(0, 3));
}

/* A stable pseudo-random number in [0,1) from a string. Using the listing id
   means a listing lands on the same spot every render instead of jumping
   around each time the map redraws. */
function dbHash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

/* Approximate position for a listing: its district centre, plus a small
   deterministic offset so listings in the same pincode don't stack on one
   pixel. Spread is roughly ±4 km — enough to read as "around here", not
   precise enough to identify an address. */
function dbCoordsForListing(listing) {
  const area = dbAreaForPincode(listing.pincode);
  if (!area) return null;
  const id = String(listing.id || listing.title || '');
  const dLat = (dbHash01(id, 1) - 0.5) * 0.07;   // ~ ±3.9 km
  const dLng = (dbHash01(id, 2) - 0.5) * 0.07;
  return { lat: area.lat + dLat, lng: area.lng + dLng, area };
}

function dbHaversineKm(a, b) {
  const R = 6371;
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/* Always prefixed with "~" — these are area-level estimates, not measured
   distances, and shouldn't be presented as exact. */
function dbFormatDistance(km) {
  if (!isFinite(km)) return '';
  if (km < 0.2) return 'Very close by';
  if (km < 10) return '~' + (Math.round(km * 10) / 10) + ' km away';
  return '~' + Math.round(km) + ' km away';
}
