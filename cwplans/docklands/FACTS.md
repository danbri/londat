# Docklands underground and multi-storey facts

Cited numeric facts about the underground and multi-storey structure of Canary Wharf, the Isle of Dogs (London E14) and nearby tunnels, for an open-data 3D model. Collected on 2026-10-02.

Machine-readable copy: `facts.json` in this folder (360 facts, 19 recorded gaps). Every quote in it was checked by a script against the cached copy of the page it cites (whitespace normalised). Wikidata values come from SPARQL; their quote is the statement as returned.

Datums used below: **OD** (Ordnance Datum Newlyn); **CD** (Chart Datum of the PLA charts, 3.35 m below OD at West India Docks); **mATD** (metres above tunnel datum, used by Crossrail and Tideway, = OD + 100 m).

## Most useful values for modelling

| Subject | Value | Reference | Source |
|---|---|---|---|
| West India Docks full impound level | 4.23 m | above OD | [Canal & River Trust MSMS, Annex B](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India Docks quay walls (generally) | 5.23 m | above OD | same |
| North Dock bed level | -5.365 m | OD | same |
| North Dock water depth | 9 m | water surface to bed | [Arup paper, The Structural Engineer 2018](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Elizabeth line station box | 260 m long, 25-30 m wide | plan | same |
| Elizabeth line platform level | 81.950 mATD (about -18 m OD) | SSL | same |
| Elizabeth line base slab | 79.600 mATD (about -20.4 m OD) | SSL | same |
| Crossrail Place roof garden level | 117.100 mATD (about +17 m OD) | SSL | same |
| Jubilee line station pit | 24 m deep, 265 m long | below drained dock | [Wikipedia](https://en.wikipedia.org/wiki/Canary_Wharf_tube_station) |
| Canada Water Jubilee platforms | 22 m | below ground | [Wikipedia](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Cutty Sark DLR platforms | 20 m | below street | [Wikipedia](https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station) |
| Rotherhithe Tunnel | 1,482 m long; max 23 m below surface | | [Wikipedia](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Thames Tunnel | 23 m below river surface at high tide | | [Wikipedia](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Limehouse Link | 1.8 km; base slab about 20 m below ground; 24 m wide | | [ISSMGE 1994](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Tideway shaft, King Edward Memorial Park | 20 m diameter, 60 m to invert (64 m excavated) | below ground | [Tideway ES Vol 21](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Lee Tunnel | -75 m | AOD | [Wikipedia](https://en.wikipedia.org/wiki/Lee_Tunnel) |
| One Canada Square | 235 m, 50 floors, 3 basements | AGL | [Wikipedia](https://en.wikipedia.org/wiki/One_Canada_Square), [SkyscraperPage](https://skyscraperpage.com/cities/?buildingID=88) |
| 8 Canada Square | 200 m, 45 floors, 4 basements | | [Wikipedia](https://en.wikipedia.org/wiki/8_Canada_Square) |
| Landmark Pinnacle | 233 m AGL, 239 m AOD | | [Wikipedia](https://en.wikipedia.org/wiki/Landmark_Pinnacle) |
| Cabot Square car park | 4 levels below ground | | [LSE Cities](https://csar.lse.ac.uk/articles/53) |
| Chalk top, Greenwich Pumping Station | 77.56 mATD (-22.44 m OD), 25.8 m below ground | | [Tideway ES Vol 24](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |

## Canary Wharf Elizabeth line station and Crossrail Place

The station is a concrete box built top-down inside a cofferdam in the North Dock. The best single source is the Arup / Canary Wharf Group paper in The Structural Engineer (July 2018), hosted by Crossrail Learning Legacy. Its Figure 6 gives structural slab levels (SSL) for every floor. The figure does not print the datum, but the values match the Crossrail tunnel datum (ATD, where 100 m ATD = 0 m OD): the figure's "Normal Highest Water Level 104.300" agrees with the Canal & River Trust full impound level of 4.23 m OD and with the Crossrail groundwater report's dock level of "about 104m ATD". Subtract 100 to get metres above OD. On that reading the platform level is about -18 m OD and the base slab about -20.4 m OD.

Level stack (SSL, mATD): Park +1 = 117.100; Ground 0 = 111.250; Promenade -1 = 105.900; Middle Concourse -2 = 100.950; Lower Concourse -3 = 95.800; Ticket Hall -4 = 88.950; Platform -5 = 81.950; Base Slab -6 = 79.600; approximate dock bed 95.000; normal highest water 104.300.

**Conflicts.** Box length: 475 m (Wikipedia), 256 m (Construction Index, NCE 2009), 260 m (Arup paper, Steel Piling Group); the Arup paper says early reference designs were "well over 300m long". Storeys: six (Construction Index, NCE 2009), seven (Wikipedia, Canary Wharf article), "five upper levels" above the station (Wikipedia, station article), "four-storey retail development" above the ticket hall and platform levels (Construction Index). Box depth: 28 m below water (Construction Index), base slab 25 m below water (NCE 2009, planned), base slab about 18 m below dock bed with 9 m of water (Arup paper, Steel Piling Group). Pile count: 293 (Wikipedia) or 310 (Arup paper, north, east and west walls only); pile diameter 1214 mm (Arup) or 1219 mm (Steel Piling Group).

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Canary Wharf Elizabeth line station | concrete box length | 475 m | horizontal | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | island platform length | 245 m | horizontal | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | platform length fitted out | 210 m | horizontal | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | station depth in an earlier (abandoned) shaft proposal | 30 m | below dock water level | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | cofferdam tube pile count | 293 piles |  | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | cofferdam tube pile length | 18.5 m | vertical | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | reinforced concrete pile depth inside tube piles | 38 m | vertical | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | number of upper levels (Crossrail Place) | 5 levels | above the station | [Wikipedia: Canary Wharf railway station](https://en.wikipedia.org/wiki/Canary_Wharf_railway_station) |
| Canary Wharf Elizabeth line station | station box length | 260 m | horizontal | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station | station box width | 25-30 m | horizontal | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| West India Docks, North Dock (at the Elizabeth line station) | dock water depth | 9 m | water surface to dock bed | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station | base slab depth | 18 m | below dock bed level (approx.) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Park +1 Level | 117.1 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Ground 0 Level | 111.25 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Promenade -1 Level | 105.9 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Middle Concourse -2 Level | 100.95 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Lower Concourse -3 Level | 95.8 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Ticket Hall Slab -4 Level | 88.95 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Platform -5 Level | 81.95 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station / Crossrail Place | structural slab level, Base Slab -6 Level | 79.6 m | SSL in mATD (Crossrail tunnel datum = OD - 100 m; datum inferred, not printed on the figure) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| West India Docks, North Dock (at the Elizabeth line station) | normal highest water level | 104.3 m | mATD (inferred, = 4.3 m OD) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| West India Docks, North Dock (at the Elizabeth line station) | approximate dock bed level | 95.0 m | mATD (inferred, = -5.0 m OD) | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station | Giken tubular pile count (north, east, west walls) | 310 piles |  | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station | Giken tubular pile diameter | 1214 mm |  | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Crossrail Place | roof length | 310 m | horizontal | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Crossrail Place | retail levels below dock water level | -1, -2, -3 levels | below water level | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Crossrail Place | floor-to-soffit height at Level -1 | 4.6 m | vertical | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Crossrail Place roof garden | typical soil depth | 1.2 m | roof level | [learninglegacy.crossrail.co.uk](https://learninglegacy.crossrail.co.uk/wp-content/uploads/2018/07/7K-005-Design-of-Canary-Wharf-Elizabeth-line-station-and-oversite-development.pdf) |
| Canary Wharf Elizabeth line station | station structure length | 260 m | horizontal | [steelpilinggroup.org](https://www.steelpilinggroup.org/project/rail-case-study-canary-wharf-crossrail-station/) |
| Canary Wharf Elizabeth line station | formation level of box | 18 m | below dock bed level (approx.) | [steelpilinggroup.org](https://www.steelpilinggroup.org/project/rail-case-study-canary-wharf-crossrail-station/) |
| West India Docks, North Dock (at the Elizabeth line station) | dock depth | 9 m | water surface to dock bed | [steelpilinggroup.org](https://www.steelpilinggroup.org/project/rail-case-study-canary-wharf-crossrail-station/) |
| Canary Wharf Elizabeth line station | tubular pile external diameter | 1219 mm |  | [steelpilinggroup.org](https://www.steelpilinggroup.org/project/rail-case-study-canary-wharf-crossrail-station/) |
| Canary Wharf Elizabeth line station | height in storeys | 6 storeys | whole building | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Canary Wharf Elizabeth line station | length | 256 m | horizontal | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Canary Wharf Elizabeth line station | depth of top-down box | 28 m | below dock water surface | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Canary Wharf Elizabeth line station | cofferdam plan size | 250 x 30 m | horizontal | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Crossrail Place | retail storeys above ticket hall and platform levels | 4 storeys | above | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Canary Wharf Elizabeth line station | long escalator length | 30 m | along escalator | [theconstructionindex.co.uk](https://www.theconstructionindex.co.uk/news/view/crossrail-takes-possession-of-completed-canary-wharf-station) |
| Canary Wharf Elizabeth line station | base slab depth (planned) | 25 m | below dock water level | [newcivilengineer.com](https://www.newcivilengineer.com/latest/crossrail-station-profile-canary-wharf-24-09-2009/) |
| Canary Wharf Elizabeth line station | height in storeys (planned) | 6 storeys | whole building | [newcivilengineer.com](https://www.newcivilengineer.com/latest/crossrail-station-profile-canary-wharf-24-09-2009/) |
| Canary Wharf Elizabeth line station | concrete pile extension below tube piles (planned) | 15 m | below dock bed | [newcivilengineer.com](https://www.newcivilengineer.com/latest/crossrail-station-profile-canary-wharf-24-09-2009/) |
| Canary Wharf Elizabeth line station | material excavated from box | 300000 t |  | [newcivilengineer.com](https://www.newcivilengineer.com/latest/crossrail-canary-wharf-station-handed-over-to-tfl-with-bond-street-catching-up-fast-25-01-2022/) |
| Crossrail Place roof garden | area | 4160 m2 | roof level | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Canary Wharf Elizabeth line station | height in storeys | 7 storeys | whole building | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Canary Wharf Elizabeth line station cofferdam | cut-off stratum | Lambeth Group clay | subsurface | [steelpilinggroup.org](https://www.steelpilinggroup.org/project/rail-case-study-canary-wharf-crossrail-station/) |

## Canary Wharf Jubilee line station

**Conflict.** Wikipedia gives a pit 24 m deep and 265 m long. The Foster + Partners fact sheet (mirrored on Archilovers) gives 27 m deep, 35 m wide and 313 m (313.85 m) long, and also "300-metre-long" in its text. The difference may be pit versus whole station including the entrance canopies; no source explains it. The ticket hall is on estate Level -2 (a blog source).

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Canary Wharf tube station (Jubilee line) | excavation depth of station pit | 24 m | below the drained dock (pit depth) | [Wikipedia: Canary Wharf tube station](https://en.wikipedia.org/wiki/Canary_Wharf_tube_station) |
| Canary Wharf tube station (Jubilee line) | length of station pit | 265 m | horizontal | [Wikipedia: Canary Wharf tube station](https://en.wikipedia.org/wiki/Canary_Wharf_tube_station) |
| Canary Wharf tube station (Jubilee line) | station depth | 27 m | below ground (architect figure) | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | station width | 35 m | horizontal | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | total length | 313.85 m | horizontal | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | ticket hall length | 222.79 m | horizontal | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | ticket hall width | 32.7 m | horizontal | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | ticket hall height | 10.8 m | floor to roof of hall | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | station length (rounded) | 300 m | horizontal | [archilovers.com](https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html) |
| Canary Wharf tube station (Jubilee line) | ticket hall level number | -2 level | estate level numbering (park = 0) | [diamondgeezer.blogspot.com](https://diamondgeezer.blogspot.com/2013/11/jubilee-place.html) |
| Jubilee Park (roof garden over Jubilee Place and the Jubilee line station) | area | 10000 m2 | roof level | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |

## Other stations

Canada Water is the best-documented box. North Greenwich figures come from an Architects' Journal interview with Will Alsop. Cutty Sark (south end of the DLR Thames tunnel) has platform depth and box dimensions; Island Gardens has no published depth.

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Canada Water station (Jubilee line box) | box length | 150 m | horizontal | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station (Jubilee line box) | box width | 23 m | horizontal | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station (Jubilee line box) | box depth | 22 m | below ground | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station (East London line slot) | slot length | 130 m | horizontal | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station (East London line slot) | slot depth | 13 m | below ground | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station | Windrush line (East London line) platform depth | 11 m | below ground | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station | Jubilee line platform depth | 22 m | below ground | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station | number of levels | 3 levels | below ground | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| Canada Water station | glass drum diameter | 25 m | horizontal | [Wikipedia: Canada Water station](https://en.wikipedia.org/wiki/Canada_Water_station) |
| North Greenwich tube station | box length | 400 m | horizontal | [architectsjournal.co.uk](https://www.architectsjournal.co.uk/archive/discussion-in-depth-about-north-greenwich-station-1-of-2) |
| North Greenwich tube station | box height | 30 m | vertical | [architectsjournal.co.uk](https://www.architectsjournal.co.uk/archive/discussion-in-depth-about-north-greenwich-station-1-of-2) |
| North Greenwich tube station | box width | 25 m | horizontal | [architectsjournal.co.uk](https://www.architectsjournal.co.uk/archive/discussion-in-depth-about-north-greenwich-station-1-of-2) |
| North Greenwich tube station | track depth | 25 m | below ground (approx.) | [architectsjournal.co.uk](https://www.architectsjournal.co.uk/archive/discussion-in-depth-about-north-greenwich-station-1-of-2) |
| North Greenwich tube station | ticket office depth (scheme) | 5 m | below ground level | [architectsjournal.co.uk](https://www.architectsjournal.co.uk/archive/discussion-in-depth-about-north-greenwich-station-1-of-2) |
| Cutty Sark DLR station | platform depth | 20 m | below street level | [Wikipedia: Cutty Sark for Maritime Greenwich DLR station](https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station) |
| Cutty Sark DLR station | station box length | 60 m | horizontal | [Wikipedia: Cutty Sark for Maritime Greenwich DLR station](https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station) |
| Cutty Sark DLR station | station box depth in storeys | 3 storeys | below ground | [Wikipedia: Cutty Sark for Maritime Greenwich DLR station](https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station) |
| Cutty Sark DLR station | box size | 60 x 23 m | horizontal | [trid.trb.org](https://trid.trb.org/view/651623) |
| Cutty Sark DLR station | diaphragm wall depth | 28.5 m | below ground | [trid.trb.org](https://trid.trb.org/view/651623) |
| DLR Lewisham extension tunnels under the Thames (Island Gardens to Cutty Sark) | bored length (each tunnel) | 1.1 km | horizontal | [trid.trb.org](https://trid.trb.org/View/477142) |
| DLR Lewisham extension tunnels under the Thames (Island Gardens to Cutty Sark) | internal diameter | 5.2 m |  | [trid.trb.org](https://trid.trb.org/View/477142) |
| DLR Lewisham extension tunnels under the Thames (Island Gardens to Cutty Sark) | bored length of twin tunnels | 1.08 km | horizontal | [trid.trb.org](https://trid.trb.org/view/651623) |

## Road, foot and rail tunnels

**Conflicts.** Thames Tunnel length 400 m (Wikipedia text, "1,300 ft") versus 396 m (Wikidata). Greenwich foot tunnel length 370.2 m (Wikipedia text) versus 370.9 m (Wikidata). Rotherhithe Tunnel 1,482 m (Wikipedia) versus 1,481 m (Wikidata). Limmo shafts 44 m deep (IanVisits) versus 40 m (Dr Sauer). The Limehouse Link paper (ISSMGE 1994) has a letter-spaced, partly misread text layer; its quotes keep the reading of that layer ("A lop down", "almost is").

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Thames Tunnel (Rotherhithe-Wapping, East London line) | depth | 23 m | below river surface at high tide | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Thames Tunnel (Rotherhithe-Wapping, East London line) | length | 400 m | horizontal | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Thames Tunnel (Rotherhithe-Wapping, East London line) | width | 11 m |  | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Thames Tunnel (Rotherhithe-Wapping, East London line) | height | 6.1 m |  | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Thames Tunnel, Rotherhithe shaft | diameter | 15 m |  | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Thames Tunnel, Wapping entrance shaft (historic description) | shaft depth | 80 ft | below street | [Wikipedia: Thames Tunnel](https://en.wikipedia.org/wiki/Thames_Tunnel) |
| Rotherhithe Tunnel | length | 1482 m | horizontal | [Wikipedia: Rotherhithe Tunnel](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Rotherhithe Tunnel | carriageway depth | 15 m | below Thames high-water level | [Wikipedia: Rotherhithe Tunnel](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Rotherhithe Tunnel | maximum depth | 23 m | below the surface | [Wikipedia: Rotherhithe Tunnel](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Rotherhithe Tunnel | tunnelling shield diameter | 9.35 m |  | [Wikipedia: Rotherhithe Tunnel](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Rotherhithe Tunnel | tunnelled (cast-iron) section length | 1124 m | horizontal | [Wikipedia: Rotherhithe Tunnel](https://en.wikipedia.org/wiki/Rotherhithe_Tunnel) |
| Limehouse Link tunnel | length | 1.8 km | horizontal | [Wikipedia: Limehouse Link tunnel](https://en.wikipedia.org/wiki/Limehouse_Link_tunnel) |
| Limehouse Link tunnel | cut-and-cover length | 1.6 km | horizontal | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Limehouse Link tunnel | typical width | 24 m | horizontal | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Limehouse Link tunnel | width at slip roads | 48 m | horizontal | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Limehouse Link tunnel | base slab depth | 20 m | below ground level (generally, about) | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Limehouse Link tunnel | maximum excavation depth (top-down section) | 18 m | below original ground level | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Limehouse Link tunnel, under Limehouse Basin | minimum water draft kept over the tunnel | 3 m | water depth above tunnel | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Blackwall Tunnel (western bore, 1897) | length | 1350 m | horizontal | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Blackwall Tunnel (eastern bore, 1967) | length | 1174 m | horizontal | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Blackwall Tunnel (western bore, 1897) | external diameter | 8.23 m |  | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Blackwall Tunnel (eastern bore, 1967) | diameter | 8.59 m |  | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Blackwall Tunnel (western bore, 1897) | vehicle height limit | 4.0 m |  | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Blackwall Tunnel (eastern bore, 1967) | vehicle height limit | 4.72 m |  | [Wikipedia: Blackwall Tunnel](https://en.wikipedia.org/wiki/Blackwall_Tunnel) |
| Greenwich foot tunnel | length | 370.2 m | horizontal | [Wikipedia: Greenwich foot tunnel](https://en.wikipedia.org/wiki/Greenwich_foot_tunnel) |
| Greenwich foot tunnel | depth | 15.2 m | not stated (deep) | [Wikipedia: Greenwich foot tunnel](https://en.wikipedia.org/wiki/Greenwich_foot_tunnel) |
| Greenwich foot tunnel | internal diameter | 2.74 m |  | [Wikipedia: Greenwich foot tunnel](https://en.wikipedia.org/wiki/Greenwich_foot_tunnel) |
| Woolwich foot tunnel | length | 504 m | horizontal | [Wikipedia: Woolwich foot tunnel](https://en.wikipedia.org/wiki/Woolwich_foot_tunnel) |
| Woolwich foot tunnel | roof depth at deepest | 3 m | below the river bed (about) | [Wikipedia: Woolwich foot tunnel](https://en.wikipedia.org/wiki/Woolwich_foot_tunnel) |
| Silvertown Tunnel | length | 1.4 km | horizontal | [Wikipedia: Silvertown Tunnel](https://en.wikipedia.org/wiki/Silvertown_Tunnel) |
| Silvertown Tunnel | TBM diameter | 11.87 m |  | [Wikipedia: Silvertown Tunnel](https://en.wikipedia.org/wiki/Silvertown_Tunnel) |
| Jubilee Line Extension running tunnels | tunnel diameter | 4.35 m |  | [Wikipedia: Jubilee Line Extension](https://en.wikipedia.org/wiki/Jubilee_Line_Extension) |
| Elizabeth line (Crossrail) bored tunnels | internal diameter | 6.2 m |  | [Wikipedia: Crossrail](https://en.wikipedia.org/wiki/Crossrail) |
| Elizabeth line (Crossrail) bored tunnels | TBM diameter | 7.1 m |  | [Wikipedia: Crossrail](https://en.wikipedia.org/wiki/Crossrail) |
| Crossrail Limmo Peninsula shafts | shaft depth | 44 m | below ground | [ianvisits.co.uk](https://www.ianvisits.co.uk/articles/a-look-at-some-deep-crossrail-tunnel-shafts-7119/) |
| Crossrail Limmo Peninsula shafts | main shaft width | 30 m |  | [ianvisits.co.uk](https://www.ianvisits.co.uk/articles/a-look-at-some-deep-crossrail-tunnel-shafts-7119/) |
| Crossrail Limmo Peninsula shafts | shaft depth and diameter | 40 deep, 30 diameter m | below ground | [projects.dr-sauer.com](http://projects.dr-sauer.com/news/370) |

## Thames Tideway Tunnel and Lee Tunnel

Tideway's Environmental Statement uses metres above tunnel datum, with "The standard zero point for mATD scale is -100maOD".

**Conflicts.** King Edward Memorial Park shaft: 64 m excavated (Tideway news 2021, NCE) versus 60 m to invert (Environmental Statement, design). Chambers Wharf: shaft "60m deep" (Water Projects Online 2016) versus diaphragm walls "just over 72 metres" deep (Tideway 2018); these are different things (wall toe versus excavation). Eastern main tunnel depth: up to 65 m below the river (Water Projects Online) versus 70 m in the east (Wikipedia).

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Thames Tideway Tunnel (main tunnel) | internal diameter | 7.2 m |  | [Wikipedia: Thames Tideway Tunnel](https://en.wikipedia.org/wiki/Thames_Tideway_Tunnel) |
| Thames Tideway Tunnel (main tunnel) | depth at eastern end | 70 m | below ground (not stated precisely) | [Wikipedia: Thames Tideway Tunnel](https://en.wikipedia.org/wiki/Thames_Tideway_Tunnel) |
| Thames Tideway Tunnel (East section) | maximum depth | 65 m | below the river | [waterprojectsonline.com](https://waterprojectsonline.com/wp-content/uploads/case_studies/2016/Thames_Water_Tideway_East_2016.pdf) |
| Thames Tideway Tunnel, Chambers Wharf main drive shaft | shaft depth (planned) | 60 m | below ground | [waterprojectsonline.com](https://waterprojectsonline.com/wp-content/uploads/case_studies/2016/Thames_Water_Tideway_East_2016.pdf) |
| Thames Tideway Tunnel, Chambers Wharf main drive shaft | diaphragm wall depth | 72 m | below ground (just over) | [tideway.london](https://tideway.london/news/site-news/2018/march/tunnel-shaft-preparation-making-headway-at-chambers-wharf/) |
| Thames Tideway Tunnel, King Edward Memorial Park Foreshore shaft (Wapping) | excavated depth | 64 m | below ground | [tideway.london](https://www.tideway.london/news/site-news/2021/july/final-concrete-base-slab-on-tideway-poured-in-projects-deepest-shaft/) |
| Thames Tideway Tunnel, King Edward Memorial Park Foreshore shaft (Wapping) | excavated depth | 64 m | below ground | [newcivilengineer.com](https://www.newcivilengineer.com/latest/tideway-completes-concrete-pour-on-deepest-and-final-shaft-10-07-2021/) |
| Thames Tideway Tunnel, King Edward Memorial Park Foreshore shaft (Wapping) | internal diameter | 20 m |  | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Thames Tideway Tunnel, King Edward Memorial Park Foreshore shaft (Wapping) | depth to invert (design) | 60 m | below top of shaft | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Thames Tideway Tunnel, Greenwich Pumping Station CSO drop shaft | internal diameter | 17 m |  | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Thames Tideway Tunnel, Greenwich Pumping Station CSO drop shaft | depth to invert | 46 m | below top of shaft (1 m above ground) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Thames Tideway Tunnel, Greenwich connection tunnel | internal diameter | 5.0 m |  | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Thames Tideway Tunnel, Greenwich connection tunnel | length | 4610 m | horizontal | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Tunnel datum used by Tideway (ATD) | zero of mATD scale | -100 m | metres above Ordnance Datum (Newlyn) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Lee Tunnel | length | 6.9 km | horizontal | [Wikipedia: Lee Tunnel](https://en.wikipedia.org/wiki/Lee_Tunnel) |
| Lee Tunnel | diameter | 7.2 m |  | [Wikipedia: Lee Tunnel](https://en.wikipedia.org/wiki/Lee_Tunnel) |
| Lee Tunnel | depth | 75-80 m | below ground (start to finish) | [Wikipedia: Lee Tunnel](https://en.wikipedia.org/wiki/Lee_Tunnel) |
| Lee Tunnel | level | -75 m | AOD | [Wikipedia: Lee Tunnel](https://en.wikipedia.org/wiki/Lee_Tunnel) |
| Lee Tunnel / Tideway connection (Abbey Mills) | depth of separating wall | 66 m | below ground | [Wikipedia: Thames Tideway Tunnel](https://en.wikipedia.org/wiki/Thames_Tideway_Tunnel) |

## Towers: heights, floors and basements

Three kinds of source: Wikipedia building infoboxes (below), the table "List of completed buildings in Canary Wharf that are at least 100 m tall" in the Wikipedia Canary Wharf article (next section), and Wikidata statements (last tower section). Few sources give basements: 8 Canada Square has 4 (Wikipedia, Wikidata); One Canada Square 3 (SkyscraperPage); Baltimore Tower 2 (Wikipedia); Newfoundland 2 (Construction News) or 3 (Wikidata); One Park Drive 2 and Landmark Pinnacle 2 (Wikidata); Ontario Tower 1 and Pan Peninsula East 1 (Wikidata). Landmark Pinnacle's infobox gives both 233 m above ground and 239 m AOD, which puts its ground at about 6 m OD.

**Conflicts.** One Canada Square height: 235 m AGL (infobox, Wikidata), 236 m (Construction News), 244 m (Isle of Dogs article, NCE); pyramid 40 m (Wikipedia) versus 39.6 m (SkyscraperPage). 8 Canada Square: 45 floors (infobox, Wikidata) versus 42 (Canary Wharf table); 200 m versus 199.51 m (Wikidata). 25 Canada Square: 45 floors (infobox, Wikidata) versus 42 (table). Landmark Pinnacle: 76 floors (infobox) versus 75 (table, Wikidata). Newfoundland: 58 floors (infobox, Wikidata) versus 60 (table, Construction News). Pan Peninsula: East 148 m (infobox, Wikidata) versus 147 m (table); West 38 floors (infobox) versus 39 (table). 10 Park Drive: 42 floors (Wood Wharf table) versus 43 (Canary Wharf table).

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| One Canada Square | architectural height | 235 m | above ground level | [Wikipedia: One Canada Square](https://en.wikipedia.org/wiki/One_Canada_Square) |
| One Canada Square | top height | 240 m | above sea level | [Wikipedia: One Canada Square](https://en.wikipedia.org/wiki/One_Canada_Square) |
| One Canada Square | floors above ground | 50 floors | above ground | [Wikipedia: One Canada Square](https://en.wikipedia.org/wiki/One_Canada_Square) |
| One Canada Square | height | 244 m | not stated | [Wikipedia: Isle of Dogs](https://en.wikipedia.org/wiki/Isle_of_Dogs) |
| One Canada Square | height | 244 m | not stated | [newcivilengineer.com](https://www.newcivilengineer.com/latest/no-22-one-canada-square-23-08-2012/) |
| One Canada Square | height | 236 m | not stated | [constructionnews.co.uk](https://constructionnews.co.uk/buildings/project-reports/canary-wharf-digs-deep-with-districts-first-residential-tower-21-06-2017) |
| One Canada Square | pyramid height | 40 m | vertical | [Wikipedia: One Canada Square](https://en.wikipedia.org/wiki/One_Canada_Square) |
| One Canada Square | pyramid height | 39.6 m | vertical | [skyscraperpage.com](https://skyscraperpage.com/cities/?buildingID=88) |
| One Canada Square | basement floors | 3 floors | below ground | [skyscraperpage.com](https://skyscraperpage.com/cities/?buildingID=88) |
| One Canada Square | Nash Court entrance level | -13 ft | relative to ground level (unconfirmed) | [skyscraperpage.com](https://skyscraperpage.com/cities/?buildingID=88) |
| One Canada Square | pile count and diameter | 222 x 1.5 m |  | [newcivilengineer.com](https://www.newcivilengineer.com/latest/no-22-one-canada-square-23-08-2012/) |
| One Canada Square | raft thickness | 4 m | vertical | [newcivilengineer.com](https://www.newcivilengineer.com/latest/no-22-one-canada-square-23-08-2012/) |
| One Canada Square | pile depth | 23 m | below ground | [designingbuildings.co.uk](https://www.designingbuildings.co.uk/wiki/One_Canada_Square) |
| 8 Canada Square (HSBC Tower) | height | 200 m | not stated | [Wikipedia: 8 Canada Square](https://en.wikipedia.org/wiki/8_Canada_Square) |
| 8 Canada Square (HSBC Tower) | floors above ground and basements | 45 above, 4 basement floors | above/below ground | [Wikipedia: 8 Canada Square](https://en.wikipedia.org/wiki/8_Canada_Square) |
| Citigroup Centre / 25 Canada Square | roof height | 200 m | not stated | [Wikipedia: Citigroup Centre (London)](https://en.wikipedia.org/wiki/Citigroup_Centre_(London)) |
| Citigroup Centre / 25 Canada Square | floors above ground | 45 floors | above ground | [Wikipedia: Citigroup Centre (London)](https://en.wikipedia.org/wiki/Citigroup_Centre_(London)) |
| One Churchill Place | roof height | 156 m | not stated | [Wikipedia: One Churchill Place](https://en.wikipedia.org/wiki/One_Churchill_Place) |
| One Churchill Place | floors above ground | 32 floors | above ground | [Wikipedia: One Churchill Place](https://en.wikipedia.org/wiki/One_Churchill_Place) |
| Landmark Pinnacle | height | 233 m | above ground level | [Wikipedia: Landmark Pinnacle](https://en.wikipedia.org/wiki/Landmark_Pinnacle) |
| Landmark Pinnacle | top height | 239 m | AOD | [Wikipedia: Landmark Pinnacle](https://en.wikipedia.org/wiki/Landmark_Pinnacle) |
| Landmark Pinnacle | floors above ground | 76 floors | above ground | [Wikipedia: Landmark Pinnacle](https://en.wikipedia.org/wiki/Landmark_Pinnacle) |
| One Park Drive | height | 205 m | not stated | [Wikipedia: One Park Drive](https://en.wikipedia.org/wiki/One_Park_Drive) |
| One Park Drive | floors above ground | 57 floors | above ground | [Wikipedia: One Park Drive](https://en.wikipedia.org/wiki/One_Park_Drive) |
| Newfoundland | height | 220 m | not stated | [Wikipedia: Newfoundland, London](https://en.wikipedia.org/wiki/Newfoundland,_London) |
| Newfoundland | floors above ground | 58 floors | above ground | [Wikipedia: Newfoundland, London](https://en.wikipedia.org/wiki/Newfoundland,_London) |
| Newfoundland | storeys | 60 storeys | above ground | [constructionnews.co.uk](https://constructionnews.co.uk/buildings/project-reports/canary-wharf-digs-deep-with-districts-first-residential-tower-21-06-2017) |
| Newfoundland | basement levels | 2 levels | below ground | [constructionnews.co.uk](https://constructionnews.co.uk/buildings/project-reports/canary-wharf-digs-deep-with-districts-first-residential-tower-21-06-2017) |
| Newfoundland | maximum pile depth | 60 m | below ground | [constructionnews.co.uk](https://constructionnews.co.uk/buildings/project-reports/canary-wharf-digs-deep-with-districts-first-residential-tower-21-06-2017) |
| Newfoundland | closest pile approach to Jubilee line tunnels | 2 m | horizontal clearance | [constructionnews.co.uk](https://constructionnews.co.uk/buildings/project-reports/canary-wharf-digs-deep-with-districts-first-residential-tower-21-06-2017) |
| South Quay Plaza (three towers) | roof heights | 214.5 / 192.4 / 130.5 m | not stated | [Wikipedia: South Quay Plaza](https://en.wikipedia.org/wiki/South_Quay_Plaza) |
| South Quay Plaza (three towers) | floors above ground | 68 / 56 / 41 floors | above ground | [Wikipedia: South Quay Plaza](https://en.wikipedia.org/wiki/South_Quay_Plaza) |
| Pan Peninsula | roof heights | East 148, West 122 m | not stated | [Wikipedia: Pan Peninsula](https://en.wikipedia.org/wiki/Pan_Peninsula) |
| Pan Peninsula | floors above ground | East 48, West 38 floors | above ground | [Wikipedia: Pan Peninsula](https://en.wikipedia.org/wiki/Pan_Peninsula) |
| Baltimore Tower (Arena Tower) | height | 149 m | not stated | [Wikipedia: Baltimore Tower](https://en.wikipedia.org/wiki/Baltimore_Tower) |
| Baltimore Tower (Arena Tower) | floors | 45 + ground + 2 basement floors | above/below ground | [Wikipedia: Baltimore Tower](https://en.wikipedia.org/wiki/Baltimore_Tower) |
| Wardian London (East / West towers) | heights | 187.2 / 168.1 m | not stated | [Wikipedia: Wardian London](https://en.wikipedia.org/wiki/Wardian_London) |
| Wardian London (East / West towers) | floors above ground | 55 / 50 floors | above ground | [Wikipedia: Wardian London](https://en.wikipedia.org/wiki/Wardian_London) |
| 10 Park Drive (Wood Wharf) | floors | 42 floors | above ground | [Wikipedia: Wood Wharf](https://en.wikipedia.org/wiki/Wood_Wharf) |

## Towers: Canary Wharf article table

Each pair of rows comes from one row of the Wikipedia table; the quote in facts.json is that row (cells: name, metres, feet, floors, completion year).

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| One Canada Square | height (Canary Wharf article table) | 235 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Canada Square | floors (Canary Wharf article table) | 50 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Landmark Pinnacle | height (Canary Wharf article table) | 233 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Landmark Pinnacle | floors (Canary Wharf article table) | 75 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Newfoundland | height (Canary Wharf article table) | 220 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Newfoundland | floors (Canary Wharf article table) | 60 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Aspen at Consort Place | height (Canary Wharf article table) | 216 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Aspen at Consort Place | floors (Canary Wharf article table) | 67 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| South Quay Plaza (Phase 1, Hampton Court) | height (Canary Wharf article table) | 215 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| South Quay Plaza (Phase 1, Hampton Court) | floors (Canary Wharf article table) | 68 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Park Drive | height (Canary Wharf article table) | 205 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Park Drive | floors (Canary Wharf article table) | 57 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 8 Canada Square | height (Canary Wharf article table) | 200 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 8 Canada Square | floors (Canary Wharf article table) | 42 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Canada Square | height (Canary Wharf article table) | 200 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Canada Square | floors (Canary Wharf article table) | 42 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Harcourt Gardens (South Quay Plaza Tower 4, Harcourt Tower, SQP4) | height (Canary Wharf article table) | 192 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Harcourt Gardens (South Quay Plaza Tower 4, Harcourt Tower, SQP4) | floors (Canary Wharf article table) | 56 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Wardian London (East Tower) | height (Canary Wharf article table) | 187 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Wardian London (East Tower) | floors (Canary Wharf article table) | 55 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Amory Tower (The Madison) | height (Canary Wharf article table) | 182 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Amory Tower (The Madison) | floors (Canary Wharf article table) | 53 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Wardian London (West Tower) | height (Canary Wharf article table) | 168 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Wardian London (West Tower) | floors (Canary Wharf article table) | 50 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 50-60 Charter Street, Tower 1 | height (Canary Wharf article table) | 161 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 50-60 Charter Street, Tower 1 | floors (Canary Wharf article table) | 49 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Thames Quay (225 Marsh Wall) | height (Canary Wharf article table) | 158 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Thames Quay (225 Marsh Wall) | floors (Canary Wharf article table) | 49 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Churchill Place | height (Canary Wharf article table) | 156 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One Churchill Place | floors (Canary Wharf article table) | 32 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 40 Bank Street | height (Canary Wharf article table) | 153 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 40 Bank Street | floors (Canary Wharf article table) | 33 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Bank Street | height (Canary Wharf article table) | 153 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Bank Street | floors (Canary Wharf article table) | 33 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 10 Upper Bank Street | height (Canary Wharf article table) | 151 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 10 Upper Bank Street | floors (Canary Wharf article table) | 32 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Arena Tower (Baltimore Tower) | height (Canary Wharf article table) | 149 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Arena Tower (Baltimore Tower) | floors (Canary Wharf article table) | 45 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Pan Peninsula (East Tower) | height (Canary Wharf article table) | 147 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Pan Peninsula (East Tower) | floors (Canary Wharf article table) | 48 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Maine Tower (Harbour Central Block D) | height (Canary Wharf article table) | 144 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Maine Tower (Harbour Central Block D) | floors (Canary Wharf article table) | 42 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One & Five Bank Street | height (Canary Wharf article table) | 143 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| One & Five Bank Street | floors (Canary Wharf article table) | 28 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 24 Marsh Wall (Landmark East Tower) | height (Canary Wharf article table) | 140 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 24 Marsh Wall (Landmark East Tower) | floors (Canary Wharf article table) | 44 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 40 Marsh Wall (Novotel London Canary Wharf) | height (Canary Wharf article table) | 128 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 40 Marsh Wall (Novotel London Canary Wharf) | floors (Canary Wharf article table) | 39 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Harbour Central Block C (Sirocco Tower) | height (Canary Wharf article table) | 125 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Harbour Central Block C (Sirocco Tower) | floors (Canary Wharf article table) | 36 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Pan Peninsula (West Tower) | height (Canary Wharf article table) | 122 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Pan Peninsula (West Tower) | floors (Canary Wharf article table) | 39 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Alta at Consort Place | height (Canary Wharf article table) | 121 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Alta at Consort Place | floors (Canary Wharf article table) | 36 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Churchill Place | height (Canary Wharf article table) | 118 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 25 Churchill Place | floors (Canary Wharf article table) | 24 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 50-60 Charter Street, Tower 2 | height (Canary Wharf article table) | 112 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 50-60 Charter Street, Tower 2 | floors (Canary Wharf article table) | 34 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Dollar Bay Tower | height (Canary Wharf article table) | 109 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Dollar Bay Tower | floors (Canary Wharf article table) | 31 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 1 West India Quay | height (Canary Wharf article table) | 108 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 1 West India Quay | floors (Canary Wharf article table) | 36 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 33 Canada Square | height (Canary Wharf article table) | 105 m | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 33 Canada Square | floors (Canary Wharf article table) | 18 floors | above ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| 10 Park Drive (Wood Wharf) | height and floors (Canary Wharf article table) | 150 m, 43 floors | not stated | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |

## Towers and tunnels: Wikidata statements

Read by SPARQL (query.wikidata.org) on 2026-10-02 for items within 3.5 km of 51.500 N, 0.020 W. Height is P2048, floors above ground P1101, floors below ground P1139, length P2043.

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| One Canada Square | height (Wikidata P2048) | 235 metre | not stated | [Wikidata Q503477](https://www.wikidata.org/wiki/Q503477) |
| One Canada Square | floors above ground (Wikidata P1101) | 50 floors | above ground | [Wikidata Q503477](https://www.wikidata.org/wiki/Q503477) |
| 8 Canada Square | height (Wikidata P2048) | 199.51 metre | not stated | [Wikidata Q572887](https://www.wikidata.org/wiki/Q572887) |
| 8 Canada Square | floors above ground (Wikidata P1101) | 45 floors | above ground | [Wikidata Q572887](https://www.wikidata.org/wiki/Q572887) |
| 8 Canada Square | floors below ground (Wikidata P1139) | 4 floors | below ground | [Wikidata Q572887](https://www.wikidata.org/wiki/Q572887) |
| Citigroup Centre | height (Wikidata P2048) | 200 metre | not stated | [Wikidata Q867663](https://www.wikidata.org/wiki/Q867663) |
| Citigroup Centre | floors above ground (Wikidata P1101) | 45 floors | above ground | [Wikidata Q867663](https://www.wikidata.org/wiki/Q867663) |
| One Churchill Place | height (Wikidata P2048) | 156.3 metre | not stated | [Wikidata Q138768](https://www.wikidata.org/wiki/Q138768) |
| One Churchill Place | floors above ground (Wikidata P1101) | 32 floors | above ground | [Wikidata Q138768](https://www.wikidata.org/wiki/Q138768) |
| Landmark Pinnacle | floors above ground (Wikidata P1101) | 75 floors | above ground | [Wikidata Q16258428](https://www.wikidata.org/wiki/Q16258428) |
| Landmark Pinnacle | floors below ground (Wikidata P1139) | 2 floors | below ground | [Wikidata Q16258428](https://www.wikidata.org/wiki/Q16258428) |
| One Park Drive | floors above ground (Wikidata P1101) | 57 floors | above ground | [Wikidata Q29378816](https://www.wikidata.org/wiki/Q29378816) |
| One Park Drive | floors below ground (Wikidata P1139) | 2 floors | below ground | [Wikidata Q29378816](https://www.wikidata.org/wiki/Q29378816) |
| Newfoundland | height (Wikidata P2048) | 219.8 metre | not stated | [Wikidata Q15917518](https://www.wikidata.org/wiki/Q15917518) |
| Newfoundland | floors above ground (Wikidata P1101) | 58 floors | above ground | [Wikidata Q15917518](https://www.wikidata.org/wiki/Q15917518) |
| Newfoundland | floors below ground (Wikidata P1139) | 3 floors | below ground | [Wikidata Q15917518](https://www.wikidata.org/wiki/Q15917518) |
| Ontario Tower | height (Wikidata P2048) | 105.5 metre | not stated | [Wikidata Q3069905](https://www.wikidata.org/wiki/Q3069905) |
| Ontario Tower | floors above ground (Wikidata P1101) | 31 floors | above ground | [Wikidata Q3069905](https://www.wikidata.org/wiki/Q3069905) |
| Ontario Tower | floors below ground (Wikidata P1139) | 1 floors | below ground | [Wikidata Q3069905](https://www.wikidata.org/wiki/Q3069905) |
| Pan Peninsula East Tower | height (Wikidata P2048) | 148 metre | not stated | [Wikidata Q22915232](https://www.wikidata.org/wiki/Q22915232) |
| Pan Peninsula East Tower | floors above ground (Wikidata P1101) | 48 floors | above ground | [Wikidata Q22915232](https://www.wikidata.org/wiki/Q22915232) |
| Pan Peninsula East Tower | floors below ground (Wikidata P1139) | 1 floors | below ground | [Wikidata Q22915232](https://www.wikidata.org/wiki/Q22915232) |
| Baltimore Tower | floors above ground (Wikidata P1101) | 45 floors | above ground | [Wikidata Q16837452](https://www.wikidata.org/wiki/Q16837452) |
| 10 Upper Bank Street | height (Wikidata P2048) | 151 metre | not stated | [Wikidata Q138760](https://www.wikidata.org/wiki/Q138760) |
| 10 Upper Bank Street | floors above ground (Wikidata P1101) | 32 floors | above ground | [Wikidata Q138760](https://www.wikidata.org/wiki/Q138760) |
| 25 Bank Street | height (Wikidata P2048) | 153 metre | not stated | [Wikidata Q138752](https://www.wikidata.org/wiki/Q138752) |
| 25 Bank Street | floors above ground (Wikidata P1101) | 33 floors | above ground | [Wikidata Q138752](https://www.wikidata.org/wiki/Q138752) |
| 40 Bank Street | floors above ground (Wikidata P1101) | 33 floors | above ground | [Wikidata Q138755](https://www.wikidata.org/wiki/Q138755) |
| 1 Cabot Square | height (Wikidata P2048) | 89 metre | not stated | [Wikidata Q2813508](https://www.wikidata.org/wiki/Q2813508) |
| 1 Cabot Square | floors above ground (Wikidata P1101) | 21 floors | above ground | [Wikidata Q2813508](https://www.wikidata.org/wiki/Q2813508) |
| 33 Canada Square | height (Wikidata P2048) | 104.8 metre | not stated | [Wikidata Q47661781](https://www.wikidata.org/wiki/Q47661781) |
| 33 Canada Square | floors above ground (Wikidata P1101) | 18 floors | above ground | [Wikidata Q47661781](https://www.wikidata.org/wiki/Q47661781) |
| One Bank Street | height (Wikidata P2048) | 142.9 metre | not stated | [Wikidata Q131225851](https://www.wikidata.org/wiki/Q131225851) |
| One Bank Street | floors above ground (Wikidata P1101) | 28 floors | above ground | [Wikidata Q131225851](https://www.wikidata.org/wiki/Q131225851) |
| Amory Tower | height (Wikidata P2048) | 182 metre | not stated | [Wikidata Q130758506](https://www.wikidata.org/wiki/Q130758506) |
| Amory Tower | floors above ground (Wikidata P1101) | 53 floors | above ground | [Wikidata Q130758506](https://www.wikidata.org/wiki/Q130758506) |
| Dollar Bay | height (Wikidata P2048) | 109 metre | not stated | [Wikidata Q44750696](https://www.wikidata.org/wiki/Q44750696) |
| Dollar Bay | floors above ground (Wikidata P1101) | 31 floors | above ground | [Wikidata Q44750696](https://www.wikidata.org/wiki/Q44750696) |
| 5 Canada Square | floors above ground (Wikidata P1101) | 16 floors | above ground | [Wikidata Q2817763](https://www.wikidata.org/wiki/Q2817763) |
| 25 Churchill Place | floors above ground (Wikidata P1101) | 23 floors | above ground | [Wikidata Q4632156](https://www.wikidata.org/wiki/Q4632156) |
| Thames Tunnel | length (Wikidata P2043) | 1300 foot | horizontal | [Wikidata Q1190691](https://www.wikidata.org/wiki/Q1190691) |
| Thames Tunnel | length (Wikidata P2043) | 396 metre | horizontal | [Wikidata Q1190691](https://www.wikidata.org/wiki/Q1190691) |
| Rotherhithe Tunnel | length (Wikidata P2043) | 1481 metre | horizontal | [Wikidata Q1450285](https://www.wikidata.org/wiki/Q1450285) |
| Greenwich foot tunnel | length (Wikidata P2043) | 1217 foot | horizontal | [Wikidata Q935104](https://www.wikidata.org/wiki/Q935104) |
| Greenwich foot tunnel | length (Wikidata P2043) | 370.9 metre | horizontal | [Wikidata Q935104](https://www.wikidata.org/wiki/Q935104) |
| Limehouse Link tunnel | length (Wikidata P2043) | 1.1 mile | horizontal | [Wikidata Q6549180](https://www.wikidata.org/wiki/Q6549180) |
| Limehouse Link tunnel | length (Wikidata P2043) | 1.8 kilometre | horizontal | [Wikidata Q6549180](https://www.wikidata.org/wiki/Q6549180) |
| 40 Marsh Wall | floors above ground (Wikidata P1101) | 39 floors | above ground | [Wikidata Q28404263](https://www.wikidata.org/wiki/Q28404263) |
| Maine Tower | floors above ground (Wikidata P1101) | 41 floors | above ground | [Wikidata Q20713829](https://www.wikidata.org/wiki/Q20713829) |
| 1 West India Quay | floors above ground (Wikidata P1101) | 36 floors | above ground | [Wikidata Q2813525](https://www.wikidata.org/wiki/Q2813525) |

## Underground malls, car parks and walkways

Canary Wharf has five interconnected malls and four underground public car parks (Cabot Square, Canada Square, Jubilee Place, Westferry Circus). Only Cabot Square car park has a published level count: four levels, vehicle access at level -2, under 2 m headroom. The underground pedestrian network is about 400 m by 600 m (LSE Cities). Crossrail Place has retail at Levels -1, -2 and -3 below dock water level (Arup paper, previous section). No source found gives the levels of Canada Place, Cabot Place or Churchill Place, or describes the service roads.

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Canary Wharf shopping malls | number of interconnected malls | 5 malls |  | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Canary Wharf shopping malls | retail floor area | 102193 m2 |  | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Canada Square | Canada Place mall position | below the square | below ground | [Wikipedia: Canary Wharf](https://en.wikipedia.org/wiki/Canary_Wharf) |
| Jubilee Place | position | below ground | below ground | [bdp.com](https://www.bdp.com/uk/projects/jubilee-place) |
| Jubilee Place extension | level | -2 level | estate level numbering | [diamondgeezer.blogspot.com](https://diamondgeezer.blogspot.com/2013/11/jubilee-place.html) |
| Canary Wharf public car parks | number of underground public car parks | 4 car parks | below ground | [excel.london](https://www.excel.london/uploads/pro-beauty---car-park-options.pdf) |
| Canary Wharf public car parks | public spaces | 2500 spaces | below ground | [excel.london](https://www.excel.london/uploads/pro-beauty---car-park-options.pdf) |
| Cabot Square car park | underground levels | 4 levels | below ground | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |
| Cabot Square car park | floor area | 19200 m2 | below ground | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |
| Cabot Square car park | maximum floor-to-ceiling height | 2 m |  | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |
| Cabot Square car park | external vehicle access level | -2 level |  | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |
| Canary Wharf underground parking (2001) | underground parking | 3000 cars | below ground | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |
| Canary Wharf underground pedestrian network | extent | 400 x 600 m | below ground | [csar.lse.ac.uk](https://csar.lse.ac.uk/articles/53) |

## Docks and water levels

The Canal & River Trust's Marine Safety Management System for the West India and Millwall Docks (Annex B and Annex C) is the key source. It ties dock levels to both Chart Datum and Ordnance Datum Newlyn (ODN = 3.35 m above Chart Datum). Full impound level is 4.23 m above ODN, quay walls are generally at 5.23 m above ODN, and the North Dock bed is 5.365 m below ODN. **Derived, not stated:** these two values give a North Dock water depth of about 9.6 m at full impound, which agrees with the "9m deep" dock water in the Arup and Steel Piling Group sources. In the facts, the ODN column of the Annex B table is given a sign from the row headings ("above", "Below CD"); the table prints the cill and bed rows without a sign.

The Survey of London (British History Online) gives historic design depths in feet: Import (North) Dock 23 ft, deepened to 28 ft, then 30 ft 6 in and in 1958 31 ft 6 in; Export (Middle) Dock 23 ft 3 in; Blackwall Basin 23 ft; South Dock 29 ft at high water; Millwall Dock 24 ft. No current depths were found for Middle Dock, South Dock, Millwall Dock, Blackwall Basin, Poplar Dock, Greenland Dock or Canada Water.

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| West India and Millwall Docks | height of quay walls (generally) | 5.23 m | ODN (Ordnance Datum Newlyn); column sign per table heading | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | full impound level | 4.23 m | ODN (Ordnance Datum Newlyn); column sign per table heading | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | North Dock bed level | -5.365 m | ODN (Ordnance Datum Newlyn); column sign per table heading | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | West India Lock cill level | -7.19 m | ODN (Ordnance Datum Newlyn); column sign per table heading | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | Chart Datum | -3.35 m | ODN (Ordnance Datum Newlyn); column sign per table heading | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | minimum impounded level | 6.99 m | above Chart Datum (PLA) | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India and Millwall Docks | target water level range | 7.3-7.6 m | above Chart Datum (PLA) | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India Lock | length mitre to mitre | 178 m | horizontal | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India Lock | width | 24 m | horizontal | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| Millwall Cutting | limiting width / limiting depth (indicative) | 23m / 3.5m | water depth | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| Bellmouth Passage | limiting width / limiting depth (indicative) | 15m / 4.4m | water depth | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| Blackwall Cutting | limiting width / limiting depth (indicative) | 18.1m / 9.6m | water depth | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| Poplar cutting | limiting width / limiting depth (indicative) | 12.1m / 7m | water depth | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| Heron Quay Canal (when open) | limiting width / limiting depth (indicative) | 9.7m / 2.4m | water depth | [canalrivertrust.org.uk](https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf) |
| West India Docks, Import Dock (North Dock), original | water depth | 23 ft | impounded water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, Import Dock (North Dock), original | plan size | 2,600 x 510 ft | horizontal | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, Import Dock (North Dock) | water depth after 1958 | 31.5 ft | impounded water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, Export Dock (Middle Dock), original | water depth (design) | 23 ft 3 in | water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, Export Dock (Middle Dock) | plan size | 2,600 x 400 ft | horizontal | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| Blackwall Basin, original | water depth | 23 ft | water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, South Dock (rebuilt 1866-70) | depth at high water | 29 ft | high water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| West India Docks, South Dock East Entrance Lock (1927-9) | length / width / depth | 955 / 80 / 35 ft |  | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp268-281) |
| Millwall Dock, original | water depth | 24 ft | water | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp353-356) |
| Millwall Dock, original | dock wall height | 28-30 ft | wall height | [british-history.ac.uk](https://www.british-history.ac.uk/survey-london/vols43-4/pp353-356) |
| West India Docks, Import and Export docks | water area | 30 and 24 acres |  | [Wikipedia: West India Docks](https://en.wikipedia.org/wiki/West_India_Docks) |
| Millwall Dock | water area | 36 acres |  | [Wikipedia: Millwall Dock](https://en.wikipedia.org/wiki/Millwall_Dock) |
| Greenland Dock | depth (final form) | 9.4 m | water | [Wikipedia: Greenland Dock](https://en.wikipedia.org/wiki/Greenland_Dock) |
| Greenland Dock | length | 690 m | horizontal | [Wikipedia: Greenland Dock](https://en.wikipedia.org/wiki/Greenland_Dock) |
| Greenland Dock lock | length / width / depth | 170 / 24 / 11 m |  | [Wikipedia: Greenland Dock](https://en.wikipedia.org/wiki/Greenland_Dock) |
| Limehouse Basin, original 1820 basin | bottom depth | 5.5 m | below Trinity High Water | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Limehouse Basin, working dock | minimum depth when working | 6 m | water | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Limehouse Basin, 1869 ship lock | width | 18.5 m |  | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Limehouse Basin, 1869 ship lock | depth over sills | 8.5 m | water over sill | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Limehouse Basin, Thames lock (1988-9) | width | 7.3 m |  | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Limehouse Basin, Thames lock | depth over sills | 3 m | water over sill | [Wikipedia: Limehouse Basin](https://en.wikipedia.org/wiki/Limehouse_Basin) |
| Isle of Dogs docks (Crossrail groundwater report) | dock water level | 104 m | mATD (about; = about 4 m OD) | [foi.tfl.gov.uk](https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf) |
| Canada Water (lake) borehole | borehole length | 80 m | below ground | [Wikipedia: Canada Water](https://en.wikipedia.org/wiki/Canada_Water) |
| Canada Water (lake) borehole | depth into chalk | 20 m | bottom of borehole | [Wikipedia: Canada Water](https://en.wikipedia.org/wiki/Canada_Water) |

## Ground

No source gives a stratum-by-stratum log at Canary Wharf itself. The Crossrail groundwater report (TfL FOI) says, for the Isle of Dogs (Canary Wharf) station, that London Clay is absent on its western side, the lower part of the station is in the Thanet Sand, a fault runs through the Thanet Sand and Chalk under West India Dock (North), and a scour hollow at the east end of the Isle of Dogs has drift to below 70 m ATD (below -30 m OD). The Canary Wharf Elizabeth line cofferdam was sealed into the Lambeth Group clay (Steel Piling Group).

The nearest numeric logs are from Tideway's Environmental Statement tables, from two sites near, not on, the Isle of Dogs: King Edward Memorial Park Foreshore at Wapping, upstream on the north bank, and Greenwich Pumping Station at Deptford Creek, across the river on the south bank. Both give top elevations in mATD (OD + 100). At Greenwich the sequence is Made Ground 2.1 m, Alluvium 1.3 m, River Terrace Deposits 7.0 m, Lambeth Group 5.0 m, Thanet Sand 10.4 m, then Chalk from 25.8 m depth (top at 77.56 mATD, that is -22.44 m OD). At Wapping, Thanet Sand starts at 76.8 mATD (-23.2 m OD) and Chalk at 65.1 mATD (-34.9 m OD). The Limehouse Link paper gives Made Ground 2-8 m and Alluvium 0-5 m north of the West India Docks.

| Subject | Property | Value | Reference | Source |
|---|---|---|---|---|
| Crossrail Canary Wharf (Isle of Dogs) station | London Clay presence | absent on western side; reappears at EB Chainage 13750 | subsurface | [foi.tfl.gov.uk](https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf) |
| Crossrail Canary Wharf (Isle of Dogs) station | stratum at base of station | Thanet Sand Formation | subsurface | [foi.tfl.gov.uk](https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf) |
| Isle of Dogs scour hollow (east end) | base of drift deposits | < 70 m | mATD (= below -30 m OD) | [foi.tfl.gov.uk](https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf) |
| Fault under the North Dock (Crossrail groundwater report) | fault | through Thanet Sand and Chalk | subsurface | [foi.tfl.gov.uk](https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf) |
| Canary Wharf development | pile type | base-grouted bored piles |  | [earthwise.bgs.ac.uk](https://earthwise.bgs.ac.uk/index.php/London_-_Applied_geology) |
| Ground at Greenwich Pumping Station (Deptford Creek): Made Ground | top elevation / depth / thickness | 103.36 mATD / 0.00 m / 2.10 m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at Greenwich Pumping Station (Deptford Creek): Alluvium | top elevation / depth / thickness | 101.26 mATD / 2.10 m / 1.30 m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at Greenwich Pumping Station (Deptford Creek): River Terrace Deposits | top elevation / depth / thickness | 99.96 mATD / 3.40 m / 7.00 m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at Greenwich Pumping Station (Deptford Creek): Lambeth Group (Upnor Formation) | top elevation / depth / thickness | 92.96 mATD / 10.40 m / 5.00 m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at Greenwich Pumping Station (Deptford Creek): Thanet Sand | top elevation / depth / thickness | 87.96 mATD / 15.40 m / 10.40 m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at Greenwich Pumping Station (Deptford Creek): Seaford Chalk | top elevation / depth / thickness | 77.56 mATD / 25.80 m / not proven m | mATD (OD + 100); depth below ground (ground 103.36 mATD) | [tideway.london](https://www.tideway.london/media/1748/6224-environmental-statement-volume-24-greenwich-pumping-station-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): River Terrace Deposits | top elevation / depth / thickness | 98.0 mATD / 0.0 m / 2.5 m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): London Clay A2 | top elevation / depth / thickness | 95.5 mATD / 2.5 m / 0.3 m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): Lambeth Group, Upper Mottled Beds | top elevation / depth / thickness | 95.2 mATD / 2.8 m / 3.2 m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): Upnor Formation | top elevation / depth / thickness | 82.6 mATD / 15.3 m / 5.8 m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): Thanet Sand | top elevation / depth / thickness | 76.8 mATD / 21.2 m / 11.6 m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at King Edward Memorial Park Foreshore (Wapping): Seaford Chalk | top elevation / depth / thickness | 65.1 mATD / 32.8 m / not proven m | mATD (OD + 100); depth from top of over-water boreholes | [tideway.london](https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf) |
| Ground at Limehouse Link: Made Ground | thickness | 2-8 m | below ground | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Ground at Limehouse Link: strata sequence | sequence | Made Ground over Thames Gravel, London Clay, Woolwich and Reading Beds, Thanet Sands, Chalk | below ground | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Ground at Limehouse Link: Alluvium | thickness | 0-5 m | below ground | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |
| Ground at Limehouse Link: Thanet Sands piezometric level | piezometric elevation | -8 to -10 m | OD | [issmge.org](https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf) |

## Searched for and not found

| Subject | Property | Searched |
|---|---|---|
| Canary Wharf, Heron Quays and West India Quay DLR stations | height of elevated track or platforms above ground or OD | <https://en.wikipedia.org/wiki/Canary_Wharf_DLR_station>; <https://en.wikipedia.org/wiki/Heron_Quays_DLR_station>; <https://en.wikipedia.org/wiki/West_India_Quay_DLR_station>; https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf (gives only DLR bridge air draughts over water) |
| Canary Wharf tube station | number of levels below ground (beyond the ticket hall at Level -2) | <https://en.wikipedia.org/wiki/Canary_Wharf_tube_station>; <https://www.archilovers.com/projects/68513/canary-wharf-underground-station.html>; https://www.fosterandpartners.com/news/jubilee-line-extension-canary-wharf-station (HTTP 403) |
| Canning Town station (Jubilee line) | platform depth or box dimensions | <https://en.wikipedia.org/wiki/Canning_Town_station> |
| Wapping station and Rotherhithe station (East London line) | platform depth below ground | <https://en.wikipedia.org/wiki/Wapping_railway_station>; <https://en.wikipedia.org/wiki/Rotherhithe_railway_station>; <https://en.wikipedia.org/wiki/Thames_Tunnel> |
| Island Gardens DLR station | depth below ground (page says only 'just below the surface') | <https://en.wikipedia.org/wiki/Island_Gardens_DLR_station>; <https://www.thetrams.co.uk/dlr/lewisham/> |
| DLR Lewisham extension tunnels under the Thames | depth below river bed or OD | <https://trid.trb.org/View/477142>; <https://trid.trb.org/view/651623>; <https://en.wikipedia.org/wiki/Cutty_Sark_for_Maritime_Greenwich_DLR_station>; https://www.tunnelsandtunnelling.com/analysis/dlr-dives-safely-under-the-thames/ (HTTP 403) |
| Jubilee line Thames crossings (Canada Water-Canary Wharf, Canary Wharf-North Greenwich, North Greenwich-Canning Town) | tunnel depth below river or OD | <https://en.wikipedia.org/wiki/Jubilee_Line_Extension>; <https://en.wikipedia.org/wiki/Jubilee_line>; <https://en.wikipedia.org/wiki/North_Greenwich_tube_station> |
| Blackwall Tunnel | depth below river bed or OD | <https://en.wikipedia.org/wiki/Blackwall_Tunnel> |
| Limehouse Link tunnel | depth under Limehouse Basin specifically; length of the basin section | <https://en.wikipedia.org/wiki/Limehouse_Link_tunnel>; <https://en.wikipedia.org/wiki/Limehouse_Basin>; <https://www.issmge.org/uploads/publications/1/32/1994_02_0101.pdf>; http://www.lddc-history.org.uk/other/limelink.pdf (host not resolvable; archive.org copy reset) |
| Elizabeth line tunnels near the Isle of Dogs and the Limmo shafts | tunnel axis depth or level | <https://learninglegacy.crossrail.co.uk/wp-content/uploads/2017/04/Machine-driven-tunnels-on-the-Elizabeth-line-London.pdf>; <https://learninglegacy.crossrail.co.uk/wp-content/uploads/2017/04/Managing-geotechnical-risk-on-Londons-Elizabeth-line.pdf>; https://learninglegacy.crossrail.co.uk/wp-content/uploads/2016/12/7A-025_2-Figure-1-post-construction-geological-profile.pdf (drawing; levels not extractable as text) |
| Thames Tideway Tunnel at Chambers Wharf and King Edward Memorial Park | main tunnel invert level (mATD or OD) | <https://waterprojectsonline.com/wp-content/uploads/case_studies/2016/Thames_Water_Tideway_East_2016.pdf>; <https://www.tideway.london/media/1749/6221-environmental-statement-volume-21-king-edward-memorial-park-foreshore-site-assessment-sections-1-to-15.pdf>; Tideway ES Volume 20 (Chambers Wharf): not located; media ids 1745-1785 and 4190-4200 probed |
| Canada Place, Cabot Place and Churchill Place malls | number of levels below ground | <https://en.wikipedia.org/wiki/Canary_Wharf>; <https://csar.lse.ac.uk/articles/53>; https://canarywharf.com/getting-here/ (JavaScript page, no content) |
| Canada Square, Jubilee Place and Westferry Circus car parks | number of levels | <https://www.excel.london/uploads/pro-beauty---car-park-options.pdf>; <https://csar.lse.ac.uk/articles/53> |
| Canary Wharf service road network | levels and extent of the service roads beneath the estate | <https://en.wikipedia.org/wiki/Canary_Wharf>; <https://csar.lse.ac.uk/articles/53> |
| 25 Canada Square, One Churchill Place, Citigroup Centre, Wood Wharf towers | number of basement floors | <https://en.wikipedia.org/wiki/Citigroup_Centre_(London)>; <https://en.wikipedia.org/wiki/One_Churchill_Place>; <https://en.wikipedia.org/wiki/Wood_Wharf>; https://query.wikidata.org/sparql (no P1139 statements) |
| Middle Dock, South Dock, Millwall Dock, Blackwall Basin, Poplar Dock (today) | present-day water depth or bed level | https://canalrivertrust.org.uk/media/document/tB54w_QEGw3s9b8-0-STeQ/2M_qfUsGGj4OY8dpZtbMIKxYqIFitUANjeM81bsw7XU/aHR0cHM6Ly9jcnRwcm9kY21zdWtzMDEuYmxvYi5jb3JlLndpbmRvd3MubmV0L2RvY3VtZW50Lw/0189927a-0ed7-725e-bea9-9ca9ec5d8374.pdf (only North Dock bed level and passage depths); <https://en.wikipedia.org/wiki/West_India_Docks>; <https://en.wikipedia.org/wiki/Millwall_Dock>; <https://en.wikipedia.org/wiki/Poplar_Dock> |
| Canada Water (lake) and Greenland Dock (today) | present-day water depth and water level relative to OD | <https://en.wikipedia.org/wiki/Canada_Water>; <https://en.wikipedia.org/wiki/Greenland_Dock> |
| Ground at Canary Wharf itself | depths/levels of made ground, alluvium, gravels, Lambeth Group, Thanet Sand and Chalk tops | <https://earthwise.bgs.ac.uk/index.php/London_-_Applied_geology>; <https://nora.nerc.ac.uk/id/eprint/16528/1/RoysetextRevised110511finaltext.pdf>; https://foi.tfl.gov.uk/FOI-2119-2223/CRL1-GCG-C2-RAN-CRG03-00002_Rev2_Redacted.pdf (levels only in figures); https://www.icevirtuallibrary.com/doi/full/10.1680/geng.11.00057 (HTTP 403); https://ui.adsabs.harvard.edu/abs/2014ICEGE.167..169T/abstract (HTTP 405); https://www.issmge.org/uploads/publications/80/112/5._Chen_&_Nicholson.pdf (bot challenge page) |
| Crossrail Learning Legacy search | site search for Canary Wharf documents | https://learninglegacy.crossrail.co.uk/?s=canary+wharf+station (returned home page); https://learninglegacy.crossrail.co.uk/wp-json/wp/v2/search (HTTP 404) |
