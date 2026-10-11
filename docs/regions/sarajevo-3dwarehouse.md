# Sarajevo: contributed 3D models in the SketchUp 3D Warehouse (survey 2026-10-11)

Owner, 2026-10-11: "Bosnia - the old Google Earth / Keyhole community repo of contribbed models (kml?) used to have a few Sarajevo buildings."

That collection is the SketchUp 3D Warehouse (Google 3D Warehouse until 2012, now Trimble), where people uploaded geolocated SketchUp models for the Google Earth 3D Buildings layer. Metadata read on 2026-10-11 from its public search API (`https://3dwarehouse.sketchup.com/warehouse/v1.0/entities?q=sarajevo&contentType=3dw`). Only metadata (title, author, date, position, id) is listed here; no model was downloaded or committed.

- Search "sarajevo": 247 models; 204 with a position; **114 within 2 km of the Vijećnica** (City Hall, OSM way 23723663).
- City Hall itself: "Biblioteka Vijecnice" (the City Hall housed the National Library), A. Popović, 2007-02-03, placed 14 m from the OSM building: https://3dwarehouse.sketchup.com/model/af5d294a8c34103881ece955d53a4e2b
- Main contributors near the old town: Miron Lukač (84), A. Popović (6), samir softic (5), numgrafika (3), VΛLT (2), Alex O. (2).
- Each model has a server-made KMZ for Google Earth (`hasServerGeneratedKmz`) and download formats (SketchUp, glTF/USDZ-type binaries).

## Licence (why nothing is committed)

The models are under the 3D Warehouse Terms of Use and its General Model License (https://3dwarehouse.sketchup.com/tos/): use, including commercial use, and derivative works are allowed, but redistribution of the models and aggregating Warehouse content for redistribution are not. That is not an open licence, so under the project rule (CLAUDE.md, data policy) the models cannot be committed or published by us. Options for the owner:

1. Repo-only reference copy in `third_party/` (not published by Pages), as for the TfL sheets: needs the owner's approval; the live page would not show them.
2. Ask the authors (A. Popović, Miron Lukač and others) to put their Sarajevo models under CC BY or CC0; then convert to glTF tiles and publish with credit.
3. Facts only: read heights, roof forms and footprints from the models to set our generic buildings (facts are not the models); record each such fact with the model id as its source.
4. Load in the visitor's browser from the Warehouse at view time, nothing stored (as the live aircraft); needs a check that the files can be fetched without sign-in and with CORS, and that the terms allow display in another application.

## Models within 2 km of the Vijećnica (distance m, title, author, date, id)

| m | title | author | date | id |
|---|---|---|---|---|
| 14 | Biblioteka Vijecnice | A. Popović | 2007-02-03 | [af5d294a8c34103881ece955d53a4e2b](https://3dwarehouse.sketchup.com/model/af5d294a8c34103881ece955d53a4e2b) |
| 180 | Sebilj na Baščaršiji | Ameritza | 2008-09-15 | [715e957c81d10d8d7074f49065d2da0b](https://3dwarehouse.sketchup.com/model/715e957c81d10d8d7074f49065d2da0b) |
| 239 | Brusa Bezistan | samir softic | 2012-03-18 | [a26785e81c6397d9bdb87ec2c67f6438](https://3dwarehouse.sketchup.com/model/a26785e81c6397d9bdb87ec2c67f6438) |
| 326 | Gazi Husrev-begova Džamija | Šemsudin H. | 2013-01-12 | [6c0cad3dd044379f6d222d8548df4371](https://3dwarehouse.sketchup.com/model/6c0cad3dd044379f6d222d8548df4371) |
| 333 | Begova Dzamija | 'Hata | 2009-02-09 | [853b04de16d284594741903881333fbc](https://3dwarehouse.sketchup.com/model/853b04de16d284594741903881333fbc) |
| 333 | Begova Dzamija | A. Popović | 2007-07-04 | [b7993c54f5f45b8df31d3603fff6d4d3](https://3dwarehouse.sketchup.com/model/b7993c54f5f45b8df31d3603fff6d4d3) |
| 362 | Stara Pravoslavna Crka | A. Popović | 2007-02-04 | [ef7b6eceb2be45712b559c1d5e2cc4d](https://3dwarehouse.sketchup.com/model/ef7b6eceb2be45712b559c1d5e2cc4d) |
| 365 | Sahat Kula ( sahat tower) | A. Popović | 2007-02-01 | [4e569762eda8b8f49bfc77b9a283dd46](https://3dwarehouse.sketchup.com/model/4e569762eda8b8f49bfc77b9a283dd46) |
| 383 | Crkva sv. Ante Padovanskog | Miron Lukač | 2010-06-11 | [675e5d45bf20f8d32ea81771550dca22](https://3dwarehouse.sketchup.com/model/675e5d45bf20f8d32ea81771550dca22) |
| 423 | Obala Kulina bana | Miron Lukač | 2010-06-20 | [b4484b5191684ba3f20cc35e5e2c5e9c](https://3dwarehouse.sketchup.com/model/b4484b5191684ba3f20cc35e5e2c5e9c) |
| 456 | Novi jevrejski hram (The New Temple - II Kal Muevu) | numgrafika | 2010-05-21 | [dea30cf015e4a70ae6d2fe5e56354685](https://3dwarehouse.sketchup.com/model/dea30cf015e4a70ae6d2fe5e56354685) |
| 483 | Kapija-kula Ploca i Širokac (Ploča and Širokac gate) | samir softic | 2012-03-29 | [56c404eca3fb1de8bdb87ec2c67f6438](https://3dwarehouse.sketchup.com/model/56c404eca3fb1de8bdb87ec2c67f6438) |
| 510 | Obala Kulina bana | Miron Lukač | 2010-06-20 | [bc289899ebe79abaf20cc35e5e2c5e9c](https://3dwarehouse.sketchup.com/model/bc289899ebe79abaf20cc35e5e2c5e9c) |
| 512 | Muzej  Alija Izetbegović (Alija Izetbegović Museum) | numgrafika | 2010-05-21 | [c77870d069034c6ce6d2fe5e56354685](https://3dwarehouse.sketchup.com/model/c77870d069034c6ce6d2fe5e56354685) |
| 541 | Kasarna Jajce (Sarajevo Bosnia and Hercegovina) | VΛLT | 2015-06-19 | [u89e67699-6c57-48d8-b3e3-808824f16664](https://3dwarehouse.sketchup.com/model/u89e67699-6c57-48d8-b3e3-808824f16664) |
| 541 | Kasarna Jajce (Vratnik / Sarajevo) | Nihad H. | 2014-05-04 | [ud095b7d2-9329-4277-8190-012c5dea89b7](https://3dwarehouse.sketchup.com/model/ud095b7d2-9329-4277-8190-012c5dea89b7) |
| 569 | Obala Kulina bana | Miron Lukač | 2010-06-20 | [33f59a98efdf51ecf20cc35e5e2c5e9c](https://3dwarehouse.sketchup.com/model/33f59a98efdf51ecf20cc35e5e2c5e9c) |
| 588 | Haris Youth Hostel | benjox | 2008-08-04 | [1cbd87408fcd1edf3750fcdcc3a20639](https://3dwarehouse.sketchup.com/model/1cbd87408fcd1edf3750fcdcc3a20639) |
| 633 | Sarajevska katedrala | A. Popović | 2007-01-24 | [36ef5e0c4d8ce6f78edf2cf3ca5f862f](https://3dwarehouse.sketchup.com/model/36ef5e0c4d8ce6f78edf2cf3ca5f862f) |
| 635 | Cathedral of Jesus' Heart | Пера | 2012-01-13 | [fa641ccba3a4327a844f883d86ed1f0](https://3dwarehouse.sketchup.com/model/fa641ccba3a4327a844f883d86ed1f0) |
| 654 | Saborna Crkva Rođenja Presvete Bogorodice | Miron Lukač | 2012-03-05 | [70252e39299b553898d03a41f8e40fac](https://3dwarehouse.sketchup.com/model/70252e39299b553898d03a41f8e40fac) |
| 661 | Mtel - Sarajevo 2 | Dejan D. | 2013-08-19 | [4f69ce7230d9bbcad9a93e7830d2419b](https://3dwarehouse.sketchup.com/model/4f69ce7230d9bbcad9a93e7830d2419b) |
| 696 | Obala Kulina bana | Miron Lukač | 2010-06-20 | [434367d2ce770f0df20cc35e5e2c5e9c](https://3dwarehouse.sketchup.com/model/434367d2ce770f0df20cc35e5e2c5e9c) |
| 702 | Army Hall, Sarajevo | Alex O. | 2007-09-17 | [f14b53739367167eb7bfe6f9ed0cc191](https://3dwarehouse.sketchup.com/model/f14b53739367167eb7bfe6f9ed0cc191) |
| 741 | UNIQA osiguranje | Miron Lukač | 2010-06-16 | [f0c499761b6452429865de0814ed91ca](https://3dwarehouse.sketchup.com/model/f0c499761b6452429865de0814ed91ca) |
| 778 | BOR banka | Miron Lukač | 2010-06-17 | [2c9bed142a695070dbebc16a80201f72](https://3dwarehouse.sketchup.com/model/2c9bed142a695070dbebc16a80201f72) |
| 791 | Srednja škola primjenjenih umjetnosti Sarajevo | Miron Lukač | 2010-06-16 | [1824c762d881a09f9865de0814ed91ca](https://3dwarehouse.sketchup.com/model/1824c762d881a09f9865de0814ed91ca) |
| 793 | Prva gimnazija (The first high school) | numgrafika | 2010-05-21 | [7e2b479080194969e6d2fe5e56354685](https://3dwarehouse.sketchup.com/model/7e2b479080194969e6d2fe5e56354685) |
| 795 | Prva gimnazija Sarajevo | Miron Lukač | 2010-06-16 | [c2d85e937461aa99865de0814ed91ca](https://3dwarehouse.sketchup.com/model/c2d85e937461aa99865de0814ed91ca) |
| 820 | OŠ Safvet-beg Bašagić | Miron Lukač | 2010-06-16 | [8d9ed15e6039875a9865de0814ed91ca](https://3dwarehouse.sketchup.com/model/8d9ed15e6039875a9865de0814ed91ca) |
| 899 | Ex Grand Hotel, Sarajevo | Alex O. | 2007-09-18 | [abcdec698f4d0cb8b8a2f530e96e7c7a](https://3dwarehouse.sketchup.com/model/abcdec698f4d0cb8b8a2f530e96e7c7a) |
| 957 | AU Zgrada - Sarajevo (Čemaluša) | Miron Lukač | 2012-06-21 | [3490cfc82d70ac478126f51c2023b59a](https://3dwarehouse.sketchup.com/model/3490cfc82d70ac478126f51c2023b59a) |
| 957 | Hotel (u izgradnji) | Miron Lukač | 2012-06-21 | [9df2a7dc71a5138b8126f51c2023b59a](https://3dwarehouse.sketchup.com/model/9df2a7dc71a5138b8126f51c2023b59a) |
| 957 | JAT-ov neboder (Vakufski neboder) | Miron Lukač | 2012-06-21 | [ae905b2142b4681e8126f51c2023b59a](https://3dwarehouse.sketchup.com/model/ae905b2142b4681e8126f51c2023b59a) |
| 957 | Napretkova palata | Miron Lukač | 2012-06-21 | [f9afe25b5cbca6b68126f51c2023b59a](https://3dwarehouse.sketchup.com/model/f9afe25b5cbca6b68126f51c2023b59a) |
| 957 | Poslovna zgrada - Čemaluša | Miron Lukač | 2012-06-21 | [7b40f7c00a3e96368126f51c2023b59a](https://3dwarehouse.sketchup.com/model/7b40f7c00a3e96368126f51c2023b59a) |
| 957 | S. Zgrada Sarajevo | Miron Lukač | 2012-06-21 | [f7a89255895663bb8126f51c2023b59a](https://3dwarehouse.sketchup.com/model/f7a89255895663bb8126f51c2023b59a) |
| 957 | Salomova palata | Miron Lukač | 2012-06-21 | [940a67f8c83b99238126f51c2023b59a](https://3dwarehouse.sketchup.com/model/940a67f8c83b99238126f51c2023b59a) |
| 957 | Sjedište ZOI 84 | Miron Lukač | 2012-06-21 | [5c54a6f9a9b90aa38126f51c2023b59a](https://3dwarehouse.sketchup.com/model/5c54a6f9a9b90aa38126f51c2023b59a) |
| 957 | Stambena zgrada - Cafe Opera | Miron Lukač | 2012-06-21 | [b9a82b7c97cc46558126f51c2023b59a](https://3dwarehouse.sketchup.com/model/b9a82b7c97cc46558126f51c2023b59a) |
| 957 | Stambena zgrada - Sirano | Miron Lukač | 2012-06-21 | [b64d5ae44b25cf2f8126f51c2023b59a](https://3dwarehouse.sketchup.com/model/b64d5ae44b25cf2f8126f51c2023b59a) |
| 957 | Stambena zgrada - Surf 'n' Fries | Miron Lukač | 2012-06-22 | [193a46c48863e1e491ee3d8f169c656c](https://3dwarehouse.sketchup.com/model/193a46c48863e1e491ee3d8f169c656c) |
| 957 | Stambena zgrada 2 - Sirano | Miron Lukač | 2012-06-21 | [327d3dc3d89da5228126f51c2023b59a](https://3dwarehouse.sketchup.com/model/327d3dc3d89da5228126f51c2023b59a) |
| 957 | Stara zgrada22 - Kulovića | Miron Lukač | 2012-06-22 | [47a2d8f332b9457e91ee3d8f169c656c](https://3dwarehouse.sketchup.com/model/47a2d8f332b9457e91ee3d8f169c656c) |
| 957 | Ugao Kulovića i Maršala Tita | Miron Lukač | 2012-06-21 | [20ad899b4b72fa298126f51c2023b59a](https://3dwarehouse.sketchup.com/model/20ad899b4b72fa298126f51c2023b59a) |
| 957 | Zgrada - Titova (Vječna vatra) | Miron Lukač | 2012-06-21 | [3c6eb9865bab73118126f51c2023b59a](https://3dwarehouse.sketchup.com/model/3c6eb9865bab73118126f51c2023b59a) |
| 957 | Zgrada kod Pozorišta mladih | Miron Lukač | 2012-06-22 | [4f67b1af9c79704391ee3d8f169c656c](https://3dwarehouse.sketchup.com/model/4f67b1af9c79704391ee3d8f169c656c) |
| 957 | Zgrada kod Pozorišta mladih | Miron Lukač | 2012-06-22 | [ef0713d74da135991ee3d8f169c656c](https://3dwarehouse.sketchup.com/model/ef0713d74da135991ee3d8f169c656c) |
| 1002 | Pozorište mladih Sarajevo | Miron Lukač | 2012-06-06 | [c75ffff7fd3ddc54c30b19f9b6ef65bb](https://3dwarehouse.sketchup.com/model/c75ffff7fd3ddc54c30b19f9b6ef65bb) |
| 1039 | Stara zgrada - pozorišni trg | Miron Lukač | 2012-06-06 | [e4636348ce3c75acc30b19f9b6ef65bb](https://3dwarehouse.sketchup.com/model/e4636348ce3c75acc30b19f9b6ef65bb) |
| 1063 | Narodno pozorište Sarajevo | Miron Lukač | 2012-06-03 | [e9978649bfd6b30e579fee9a6e72eb4d](https://3dwarehouse.sketchup.com/model/e9978649bfd6b30e579fee9a6e72eb4d) |
| 1083 | AU zgrada - Titova | Miron Lukač | 2012-05-23 | [a040ad4cf926d5856e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/a040ad4cf926d5856e6c95a8150c49a2) |
| 1083 | Hotel Bosnia Sarajevo | Miron Lukač | 2012-05-23 | [4c5428c3e1178742b2f8b6925f4bd9d9](https://3dwarehouse.sketchup.com/model/4c5428c3e1178742b2f8b6925f4bd9d9) |
| 1083 | PBS | Miron Lukač | 2012-05-23 | [7010dc74ed3600396e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/7010dc74ed3600396e6c95a8150c49a2) |
| 1083 | Stambena zgrada - Kulovića | Miron Lukač | 2012-05-23 | [dcdbe265ae6c0a766e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/dcdbe265ae6c0a766e6c95a8150c49a2) |
| 1083 | Stambena zgrada - Titova ulica | Miron Lukač | 2012-05-23 | [413970cb76c70fac6e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/413970cb76c70fac6e6c95a8150c49a2) |
| 1083 | Stambena zgrada1 - Sarajevo | Miron Lukač | 2012-05-23 | [c1b66ee9362004941e5d7a71e465dde8](https://3dwarehouse.sketchup.com/model/c1b66ee9362004941e5d7a71e465dde8) |
| 1083 | Stara zgrada1 - Kulovica | Miron Lukač | 2012-05-23 | [7ac864e9862943406e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/7ac864e9862943406e6c95a8150c49a2) |
| 1083 | Supermarket - Branilaca Sarajeva | Miron Lukač | 2012-05-23 | [222e5bb594e51891b2f8b6925f4bd9d9](https://3dwarehouse.sketchup.com/model/222e5bb594e51891b2f8b6925f4bd9d9) |
| 1083 | U2 Pizza | Miron Lukač | 2012-05-23 | [3ebd6d002287e3006e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/3ebd6d002287e3006e6c95a8150c49a2) |
| 1083 | UN building - Sarajevo | Miron Lukač | 2012-05-23 | [c6323ebe236c85ae6e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/c6323ebe236c85ae6e6c95a8150c49a2) |
| 1083 | Ugao Branilaca Sarajeva i Kulovića ulice | Miron Lukač | 2012-05-23 | [dd4af3d28c5625f76e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/dd4af3d28c5625f76e6c95a8150c49a2) |
| 1083 | Ugao Kulovića i Titove ulice | Miron Lukač | 2012-05-23 | [506085c0a51f6a336e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/506085c0a51f6a336e6c95a8150c49a2) |
| 1083 | Ugao Titove i Šenoine ulice | Miron Lukač | 2012-05-23 | [2e77ef8afdd962c36e6c95a8150c49a2](https://3dwarehouse.sketchup.com/model/2e77ef8afdd962c36e6c95a8150c49a2) |
| 1083 | Von Habsburg Cafe | Miron Lukač | 2012-05-23 | [7b430e066f0f5c76644084b0d1c8a1](https://3dwarehouse.sketchup.com/model/7b430e066f0f5c76644084b0d1c8a1) |
| 1083 | Zgrada - Branilaca Sarajeva | Miron Lukač | 2012-05-23 | [c9bd006e0aa314b376644084b0d1c8a1](https://3dwarehouse.sketchup.com/model/c9bd006e0aa314b376644084b0d1c8a1) |
| 1104 | Glavna pošta Sarajevo | Miron Lukač | 2010-06-14 | [d7b4d82486dbcc6afed49aaf9e5636d0](https://3dwarehouse.sketchup.com/model/d7b4d82486dbcc6afed49aaf9e5636d0) |
| 1107 | B. Sarajeva - Fabulas | Miron Lukač | 2012-06-07 | [a96e037ccbf0102231c6c8928d151d53](https://3dwarehouse.sketchup.com/model/a96e037ccbf0102231c6c8928d151d53) |
| 1107 | Stambena zgrada - pošta | Miron Lukač | 2012-06-06 | [6f83072756cd16255b6f22c42cfa54d4](https://3dwarehouse.sketchup.com/model/6f83072756cd16255b6f22c42cfa54d4) |
| 1172 | Pravosudna palata | Miron Lukač | 2010-04-18 | [ca15bfe4922f28479dd0dbbe582aecf7](https://3dwarehouse.sketchup.com/model/ca15bfe4922f28479dd0dbbe582aecf7) |
| 1198 | AU zgrada - Titova | Miron Lukač | 2012-05-05 | [b2f61fbdb9eb95d226ccf9adb910a469](https://3dwarehouse.sketchup.com/model/b2f61fbdb9eb95d226ccf9adb910a469) |
| 1198 | Apoteka - Titova | Miron Lukač | 2012-05-17 | [d953cfdc812fa1bab22b16390842ebc1](https://3dwarehouse.sketchup.com/model/d953cfdc812fa1bab22b16390842ebc1) |
| 1198 | Crkva Sv. VInka Sarajevo | Miron Lukač | 2012-05-03 | [cc2ef4f86fdf9f8b274a6d9ead2fbb2](https://3dwarehouse.sketchup.com/model/cc2ef4f86fdf9f8b274a6d9ead2fbb2) |
| 1198 | Energoinvest - Titova | Miron Lukač | 2012-05-04 | [3ecf4349820bfb3a26ccf9adb910a469](https://3dwarehouse.sketchup.com/model/3ecf4349820bfb3a26ccf9adb910a469) |
| 1198 | Lutrija - Marsala Tita | Miron Lukač | 2012-05-10 | [f9ec2616028ffcb8afbcfe9df08f8c17](https://3dwarehouse.sketchup.com/model/f9ec2616028ffcb8afbcfe9df08f8c17) |
| 1198 | Stambena zgrada - Titova | Miron Lukač | 2012-05-08 | [72b178139ab9290897037bee3874841b](https://3dwarehouse.sketchup.com/model/72b178139ab9290897037bee3874841b) |
| 1198 | Stara zgrada - Titova | Miron Lukač | 2012-05-12 | [9706388ad9a6fc53e8ec7795df6b9334](https://3dwarehouse.sketchup.com/model/9706388ad9a6fc53e8ec7795df6b9334) |
| 1253 | Neboder "Parkuša" | Miron Lukač | 2012-04-30 | [fba51484b131fc5442f43d8de27acfa0](https://3dwarehouse.sketchup.com/model/fba51484b131fc5442f43d8de27acfa0) |
| 1256 | Marsala Tita - BBI | Miron Lukač | 2010-11-13 | [ba23da64e0fb1053bad5f9c75843baeb](https://3dwarehouse.sketchup.com/model/ba23da64e0fb1053bad5f9c75843baeb) |
| 1256 | Old house - Sarajevo | Miron Lukač | 2011-01-07 | [56fb4d568bee03b886e01329b78925d4](https://3dwarehouse.sketchup.com/model/56fb4d568bee03b886e01329b78925d4) |
| 1256 | Zgrada - Euroherc | Miron Lukač | 2010-12-04 | [81fbe8ab4e59f3a079f5ea234410881a](https://3dwarehouse.sketchup.com/model/81fbe8ab4e59f3a079f5ea234410881a) |
| 1258 | Kantonalni sud Sarajevo | Miron Lukač | 2010-12-05 | [77b2971c2cab02f1297833c497d89ede](https://3dwarehouse.sketchup.com/model/77b2971c2cab02f1297833c497d89ede) |
| 1258 | Stara zgrada - Sarajevo | Miron Lukač | 2010-12-05 | [726e5f9128852cbd297833c497d89ede](https://3dwarehouse.sketchup.com/model/726e5f9128852cbd297833c497d89ede) |
| 1258 | Sud - Sarajevo | Miron Lukač | 2010-12-05 | [1c0b1c589ce64c31297833c497d89ede](https://3dwarehouse.sketchup.com/model/1c0b1c589ce64c31297833c497d89ede) |
| 1285 | Marsala Tita-BBI | samir softic | 2011-06-08 | [120308f375521cac3003aea3291ccb6f](https://3dwarehouse.sketchup.com/model/120308f375521cac3003aea3291ccb6f) |
| 1293 | Akademija likovnih umjetnosti Sarajevo | Miron Lukač | 2010-06-14 | [751ed70f30a833d1fed49aaf9e5636d0](https://3dwarehouse.sketchup.com/model/751ed70f30a833d1fed49aaf9e5636d0) |
| 1339 | BBI Centar | Miron Lukač | 2012-05-22 | [ed2b4505e5c8a01a800da6d67a27735](https://3dwarehouse.sketchup.com/model/ed2b4505e5c8a01a800da6d67a27735) |
| 1342 | zgrada - Obala Kulina bana | Miron Lukač | 2010-11-07 | [11faaaaf0c4e863e776264e63f8bfc10](https://3dwarehouse.sketchup.com/model/11faaaaf0c4e863e776264e63f8bfc10) |
| 1350 | AU zgrada - Mis Irbina | Miron Lukač | 2010-12-04 | [af6f7a8b69d5a67c78017d8934094a5f](https://3dwarehouse.sketchup.com/model/af6f7a8b69d5a67c78017d8934094a5f) |
| 1350 | AU zgrada - Sarajevo | Miron Lukač | 2010-12-04 | [7e2867dce27631e278017d8934094a5f](https://3dwarehouse.sketchup.com/model/7e2867dce27631e278017d8934094a5f) |
| 1350 | MUP KS | Miron Lukač | 2010-12-04 | [c362a6453c93d4ea78017d8934094a5f](https://3dwarehouse.sketchup.com/model/c362a6453c93d4ea78017d8934094a5f) |
| 1350 | Sarajevo - Mis Irbina | Miron Lukač | 2010-12-04 | [65e05362bd72a7ea78017d8934094a5f](https://3dwarehouse.sketchup.com/model/65e05362bd72a7ea78017d8934094a5f) |
| 1392 | Feroelektro | Miron Lukač | 2010-11-10 | [1e4e34ba9e6165d67bed1edfe60a7aaa](https://3dwarehouse.sketchup.com/model/1e4e34ba9e6165d67bed1edfe60a7aaa) |
| 1401 | AU zgrada | Miron Lukač | 2010-11-10 | [c250df8e92f565c7bed1edfe60a7aaa](https://3dwarehouse.sketchup.com/model/c250df8e92f565c7bed1edfe60a7aaa) |
| 1401 | AU zgrade | Miron Lukač | 2010-11-08 | [4c32a964bfc8986a5446a09d2834aed4](https://3dwarehouse.sketchup.com/model/4c32a964bfc8986a5446a09d2834aed4) |
| 1410 | AU zgrada | Miron Lukač | 2010-11-09 | [ef096f387807bf337bed1edfe60a7aaa](https://3dwarehouse.sketchup.com/model/ef096f387807bf337bed1edfe60a7aaa) |
| 1441 | Centar za sport i rekreaciju FIS | Miron Lukač | 2010-06-16 | [69fa80d183515a809865de0814ed91ca](https://3dwarehouse.sketchup.com/model/69fa80d183515a809865de0814ed91ca) |
| 1442 | Gimnazija Obala Sarajevo | Miron Lukač | 2010-11-07 | [961849b4e18d37b193d0ce3e1643c998](https://3dwarehouse.sketchup.com/model/961849b4e18d37b193d0ce3e1643c998) |
| 1466 | Courtyard by Marriott Sarajevo | VΛLT | 2015-11-26 | [u812af02d-4fe9-410e-94db-1236611dbe60](https://3dwarehouse.sketchup.com/model/u812af02d-4fe9-410e-94db-1236611dbe60) |
| 1486 | Stambena zgrada - kino Tesla | Miron Lukač | 2010-11-07 | [ec507d844365fe6b776264e63f8bfc10](https://3dwarehouse.sketchup.com/model/ec507d844365fe6b776264e63f8bfc10) |
| 1516 | Kino Apolo | Miron Lukač | 2010-07-08 | [2a7e5271fee441a441321591caf4c188](https://3dwarehouse.sketchup.com/model/2a7e5271fee441a441321591caf4c188) |
| 1540 | Dom Sindikata BiH | Miron Lukač | 2010-06-14 | [a8622c531d44f77afed49aaf9e5636d0](https://3dwarehouse.sketchup.com/model/a8622c531d44f77afed49aaf9e5636d0) |
| 1549 | Rijaset IZ BiH - Ured za hadž | Miron Lukač | 2010-06-15 | [f043d21aed1ae6d290c3cd30b5db0ba4](https://3dwarehouse.sketchup.com/model/f043d21aed1ae6d290c3cd30b5db0ba4) |
| 1553 | Predsjedništvo Bosne i Hercegovine | Miron Lukač | 2012-05-01 | [8dd9369fab8e8145ab4bf6bdaea92395](https://3dwarehouse.sketchup.com/model/8dd9369fab8e8145ab4bf6bdaea92395) |
| 1574 | New Grbavica | DanyCreator | 2013-01-16 | [b06400ec08237b01d12d8f9d868278b6](https://3dwarehouse.sketchup.com/model/b06400ec08237b01d12d8f9d868278b6) |
| 1656 | Alipašina džamija, Sarajevo | A. Popović | 2009-03-06 | [e76b4f556e1d23c962060507d875690f](https://3dwarehouse.sketchup.com/model/e76b4f556e1d23c962060507d875690f) |
| 1670 | Higijenski zavod | Miron Lukač | 2010-04-16 | [74966e5fddedd309be24bc7a875cecee](https://3dwarehouse.sketchup.com/model/74966e5fddedd309be24bc7a875cecee) |
| 1693 | Faculty of Medicine Sarajevo | rpusic | 2013-06-06 | [e6dacfc4d85ff289926425571030bd02](https://3dwarehouse.sketchup.com/model/e6dacfc4d85ff289926425571030bd02) |
| 1762 | Bolnička 11, Sarajevo, BIH | danijel.p11 | 2013-05-30 | [13c2b89e921166818fa94c73851d6c84](https://3dwarehouse.sketchup.com/model/13c2b89e921166818fa94c73851d6c84) |
| 1798 | Park - Druga gimnazija | Miron Lukač | 2011-07-29 | [5f67066554c53adadb01484da7a162d0](https://3dwarehouse.sketchup.com/model/5f67066554c53adadb01484da7a162d0) |
| 1807 | Stambene zgrade, Ciglane | samir softic | 2011-06-23 | [5575d1fbae04102f3003aea3291ccb6f](https://3dwarehouse.sketchup.com/model/5575d1fbae04102f3003aea3291ccb6f) |
| 1843 | Civil Engineering Faculty in Sarajevo - Department for Geodesy | davorp7 | 2012-06-06 | [d31ab801a1fb2be656c09ee79538b6cc](https://3dwarehouse.sketchup.com/model/d31ab801a1fb2be656c09ee79538b6cc) |
| 1855 | Sarajevo- Valtera Perića 5 | Boris G. | 2012-08-29 | [6615fa508f2a9d86d1476671d3567b10](https://3dwarehouse.sketchup.com/model/6615fa508f2a9d86d1476671d3567b10) |
| 1856 | Health center | samir softic | 2011-09-30 | [315f9540e47d4324b603607fdcc7d2e4](https://3dwarehouse.sketchup.com/model/315f9540e47d4324b603607fdcc7d2e4) |

The Google Earth Community forum (the old Keyhole BBS, bbs.keyhole.com, closed in 2015) held placemarks and KMZ files that mostly linked to these Warehouse models; copies may be in the Internet Archive (crawls via IA are allowed for scoping: CLAUDE.md). Not searched yet.
