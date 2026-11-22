import type { MedicalTextbook, StudyGuide, TextbookPage } from '../types/medical';
import { chunkPagesIntoPassages } from '../utils/textbookEngine';
import { SAMPLE_PHARMACOLOGY_BOOK } from './samplePharmacologyBook';

const COMPENDIUM_PAGES: TextbookPage[] = [
  {
    pageNumber: 1,
    chapterTitle: 'Chapter 1 (Page 1): Acute Coronary Syndromes & STEMI Reperfusion',
    text: `Chapter 1 (Page 1): Acute Coronary Syndromes & STEMI Reperfusion

Acute coronary syndrome (ACS) arises from atherosclerotic plaque rupture with platelet GP IIb/IIIa aggregation and coronary thrombosis. Complete occlusion produces STEMI; subtotal occlusion causes NSTEMI or unstable angina differentiated by high-sensitivity cardiac troponin elevation above the 99th percentile.

Inferior STEMI (ST elevation in leads II, III, aVF; Right Coronary Artery in 85%) requires right-sided V4R ECG to exclude right ventricular infarction. Nitrates and diuretics are strictly contraindicated in RV infarction due to preload dependence; treat hypotension with isotonic IV fluid boluses.

Immediate Management & Reperfusion: Obtain 12-lead ECG within 10 minutes, administer chewable non-enteric aspirin 325 mg, P2Y12 inhibitor (ticagrelor or prasugrel), unfractionated heparin, supplemental oxygen only if SpO2 < 90%, and primary PCI within 90 minutes (or tenecteplase fibrinolysis within 30 minutes if PCI is unavailable within 120 minutes).`,
  },
  {
    pageNumber: 2,
    chapterTitle: 'Chapter 2 (Page 2): Chronic & Acute Decompensated Heart Failure',
    text: `Chapter 2 (Page 2): Chronic & Acute Decompensated Heart Failure

Heart failure with reduced ejection fraction (HFrEF, LVEF <= 40%) involves systolic dysfunction, eccentric remodeling, an S3 gallop, and maladaptive neurohormonal activation of RAAS and sympathetic beta-1 signaling. HFpEF (LVEF >= 50%) stems from concentric hypertrophy, diastolic stiffness, and an S4 gallop. Ventricular wall stretch releases BNP and NT-proBNP; severe obesity lowers measured serum BNP whereas chronic kidney disease elevates baseline BNP.

Acute Decompensated Heart Failure (ADHF) Forrester Profiles: Acute Warm-and-Wet pulmonary edema (~70% of cases) presents with orthopnea, bibasilar rales, elevated JVP, and warm extremities, treated with IV loop diuretics (furosemide, bumetanide, or torsemide), nitroglycerin if hypertensive, and BiPAP/CPAP ventilation (lowers both LV preload and afterload). Cold-and-Wet cardiogenic shock presents with cool clammy extremities, narrow pulse pressure, oliguria, and lactic acidosis—stabilize with inotropes (dobutamine or milrinone) and avoid acute beta-blockers.

Four GDMT Mortality-Reducing Pillars for Chronic HFrEF: (1) ARNI (sacubitril-valsartan after a strict 36-hour ACE inhibitor washout to prevent angioedema) or ACEi/ARB, (2) evidence-based beta-blocker (carvedilol, metoprolol succinate, or bisoprolol initiated once euvolemic), (3) MRA (spironolactone or eplerenone if K+ < 5.0 mEq/L and eGFR > 30 mL/min), and (4) SGLT2 inhibitor (dapagliflozin or empagliflozin regardless of diabetes status).`,
  },
  {
    pageNumber: 3,
    chapterTitle: 'Chapter 3 (Page 3): Atrial Fibrillation — Stroke Risk & Anticoagulation',
    text: `Chapter 3 (Page 3): Atrial Fibrillation — Stroke Risk & Anticoagulation

Atrial fibrillation features chaotic atrial depolarization originating near the pulmonary vein ostia, producing an irregularly irregular rhythm with absent P waves on ECG and stasis-related thrombus risk in the left atrial appendage.

Hemodynamically unstable atrial fibrillation (hypotension, acute pulmonary edema, or ongoing myocardial ischemia) requires immediate synchronized direct-current cardioversion. Stable rate control uses beta-blockers (metoprolol) or non-dihydropyridine calcium channel blockers (diltiazem or verapamil), avoiding diltiazem/verapamil in decompensated HFrEF or Wolff-Parkinson-White (WPW) pre-excitation (use procainamide in WPW).

Long-term thromboembolic stroke prevention is guided by the CHA2DS2-VASc score (>= 2 in men, >= 3 in women): prefer Direct Oral Anticoagulants (apixaban, rivaroxaban, dabigatran) over warfarin unless a mechanical heart valve or moderate-to-severe rheumatic mitral stenosis is present.`,
  },
  {
    pageNumber: 4,
    chapterTitle: 'Chapter 4 (Page 4): Infective Endocarditis — Duke Criteria & Empiric Therapy',
    text: `Chapter 4 (Page 4): Infective Endocarditis — Duke Criteria & Empiric Therapy

Infective endocarditis is microbial infection of the cardiac valvular endothelium. Staphylococcus aureus causes acute destructive native-valve and injection-drug tricuspid endocarditis; Viridans streptococci cause subacute endocarditis on previously damaged valves after dental manipulation; Staphylococcus epidermidis predominates on early prosthetic valves; Streptococcus gallolyticus (bovis) bacteremia mandates colonoscopy to exclude occult colorectal carcinoma.

Clinical Stigmata: Fever, new regurgitant murmur, Janeway lesions (painless erythematous palmar/plantar septic microemboli), Osler nodes (painful violaceous fingertip immune-complex nodules), Roth spots, and splinter hemorrhages.

Diagnosis & Treatment: Obtain 3 sets of blood cultures from separate venipuncture sites BEFORE starting empiric IV vancomycin + ceftriaxone, and perform transesophageal echocardiography (TEE, > 90% sensitivity) when transthoracic echocardiography is nondiagnostic or prosthetic valve infection is suspected.`,
  },
  {
    pageNumber: 5,
    chapterTitle: 'Chapter 5 (Page 5): Pericarditis & Cardiac Tamponade',
    text: `Chapter 5 (Page 5): Pericarditis & Cardiac Tamponade

Acute pericarditis presents with sharp pleuritic retrosternal chest pain relieved by sitting upright and leaning forward, a triphasic pericardial friction rub, and diffuse concave ST-segment elevations with PR-segment depression across leads I, II, aVL, aVF, and V2-V6 (with reciprocal PR elevation in aVR).

First-line treatment for acute viral or idiopathic pericarditis is high-dose NSAIDs (ibuprofen or aspirin; use aspirin alone if post-myocardial infarction) PLUS colchicine for 3 months to halve recurrence risk. Systemic corticosteroids are avoided initially because they increase recurrence rates.

Cardiac Tamponade: Rapid pericardial fluid accumulation compresses cardiac chambers and impairs diastolic filling. Beck triad includes hypotension, muffled heart sounds, and distended jugular veins, accompanied by pulsus paradoxus (> 10 mmHg inspiratory fall in systolic blood pressure) and electrical alternans on ECG. Perform urgent echocardiogram-guided pericardiocentesis.`,
  },
  {
    pageNumber: 6,
    chapterTitle: 'Chapter 6 (Page 6): Community-Acquired Pneumonia (CAP)',
    text: `Chapter 6 (Page 6): Community-Acquired Pneumonia (CAP)

Community-acquired pneumonia is acute parenchymal lung infection acquired outside hospital settings. Streptococcus pneumoniae is the leading typical lobar bacterial pathogen; Mycoplasma pneumoniae and Legionella pneumophila are major atypical pathogens (Legionella classically causes high fever, relative bradycardia, watery diarrhea, and hyponatremia with serum Na < 130 mEq/L).

Triage via CURB-65 Score (Confusion, BUN > 20 mg/dL, Respiratory rate >= 30/min, Blood pressure < 90/60 mmHg, Age >= 65 years): score 0-1 warrants outpatient therapy, score 2 inpatient ward admission, and score >= 3 ICU evaluation.

Empiric Antibiotic Regimens: Healthy outpatients without comorbidities receive high-dose amoxicillin or doxycycline; outpatients with cardiopulmonary comorbidities receive amoxicillin-clavulanate + azithromycin (or respiratory fluoroquinolone); non-ICU inpatients receive IV ceftriaxone + azithromycin or levofloxacin monotherapy.`,
  },
  {
    pageNumber: 7,
    chapterTitle: 'Chapter 7 (Page 7): Pulmonary Embolism & Venous Thromboembolism',
    text: `Chapter 7 (Page 7): Pulmonary Embolism & Venous Thromboembolism

Pulmonary embolism originates most commonly (> 90%) from proximal lower-extremity deep vein thrombosis (iliac, femoral, popliteal veins) driven by Virchow triad: venous stasis, endothelial injury, and hypercoagulability. Resting sinus tachycardia is the most frequent ECG abnormality, whereas the S1Q3T3 pattern reflects acute right ventricular strain.

Diagnostic Algorithm (Modified Wells Criteria): Score <= 4 (PE Unlikely) warrants high-sensitivity D-dimer testing (safely excludes PE if negative); Score > 4 (PE Likely) bypasses D-dimer and proceeds directly to CT Pulmonary Angiography (CTPA), or Ventilation-Perfusion (V/Q) scintigraphy in severe renal impairment when baseline chest radiograph is normal.

Hemodynamic Management: Direct oral anticoagulants (apixaban or rivaroxaban) for hemodynamically stable PE; systemic IV alteplase (tPA) thrombolysis for massive high-risk PE with persistent hypotension (SBP < 90 mmHg); Inferior Vena Cava (IVC) filter strictly when anticoagulation is absolutely contraindicated.`,
  },
  {
    pageNumber: 8,
    chapterTitle: 'Chapter 8 (Page 8): Chronic Obstructive Pulmonary Disease (COPD)',
    text: `Chapter 8 (Page 8): Chronic Obstructive Pulmonary Disease (COPD)

COPD is confirmed by post-bronchodilator spirometry demonstrating irreversible airflow limitation with FEV1/FVC < 0.70. Emphysema exhibits decreased diffusing capacity (DLCO) from alveolar-capillary destruction; suspect congenital Alpha-1 Antitrypsin deficiency in young patients (< 45 years) with basilar-predominant panacinar emphysema and concurrent liver disease.

Mortality Reduction: Only TWO interventions reduce all-cause mortality in chronic COPD—smoking cessation and Long-Term Oxygen Therapy (>= 15 hours/day for resting PaO2 <= 55 mmHg or SpO2 <= 88%, or PaO2 56-59 mmHg with cor pulmonale or polycythemia Hct > 55%).

Acute Exacerbation (AECOPD) Protocol: Titrate supplemental oxygen strictly to SpO2 88-92% (hyperoxia worsens hypercapnia via Haldane effect and V/Q mismatch), administer nebulized albuterol + ipratropium, oral prednisone 40 mg daily for 5 days, antibiotics when sputum purulence increases, and BiPAP for acute hypercapnic acidosis (pH <= 7.35).`,
  },
  {
    pageNumber: 9,
    chapterTitle: 'Chapter 9 (Page 9): Acute Asthma Exacerbation & Status Asthmaticus',
    text: `Chapter 9 (Page 9): Acute Asthma Exacerbation & Status Asthmaticus

Asthma is reversible airway hyperresponsiveness driven by Th2 eosinophilic inflammation (IL-4, IL-5, IL-13), goblet cell metaplasia, and bronchial smooth muscle bronchospasm. Spirometry shows bronchodilator reversibility (FEV1 increase >= 12% and >= 200 mL) or positive methacholine bronchoprovocation.

Critical Red Flag in Severe Acute Asthma: Early exacerbation causes tachypnea and respiratory alkalosis (low PaCO2). A "normalizing" or rising PaCO2 (>= 40-45 mmHg) accompanied by drowsiness or a "silent chest" (absent wheezing from minimal airflow) signals impending respiratory muscle exhaustion and need for immediate endotracheal intubation!

Acute Exacerbation Management: Repetitive inhaled SABA (albuterol) + SAMA (ipratropium), early systemic corticosteroids (IV methylprednisolone or oral prednisone), and single-dose IV magnesium sulfate (2 g infused over 20 minutes) for life-threatening refractory bronchospasm.`,
  },
  {
    pageNumber: 10,
    chapterTitle: 'Chapter 10 (Page 10): Pleural Effusion — Light Criteria & Empyema',
    text: `Chapter 10 (Page 10): Pleural Effusion — Light Criteria & Empyema

Diagnostic thoracentesis differentiates transudative effusions (elevated hydrostatic or decreased oncotic pressure: heart failure, hepatic cirrhosis, nephrotic syndrome) from exudative pleural effusions (bacterial pneumonia, malignancy, pulmonary embolism, tuberculosis).

Light Criteria — A pleural effusion is EXUDATIVE if ANY ONE of the following three criteria is met:
1. Pleural fluid protein / Serum protein ratio > 0.5
2. Pleural fluid LDH / Serum LDH ratio > 0.6
3. Pleural fluid LDH > two-thirds (2/3) the upper limit of normal for serum LDH.

Complicated Parapneumonic Effusion & Empyema: Pleural fluid pH < 7.20, pleural glucose < 60 mg/dL, frank pus, or positive Gram stain/culture mandates immediate chest tube thoracostomy drainage alongside systemic antibiotics; antibiotics alone fail to penetrate the loculated acidic pleural cavity.`,
  },
  {
    pageNumber: 11,
    chapterTitle: 'Chapter 11 (Page 11): Acute Pancreatitis — Atlanta Criteria & Resuscitation',
    text: `Chapter 11 (Page 11): Acute Pancreatitis — Atlanta Criteria & Resuscitation

Acute pancreatitis results from premature intra-acinar trypsinogen activation and pancreatic autodigestion, caused most frequently by gallstones (40-45%) and alcohol (30%), followed by severe hypertriglyceridemia (> 1,000 mg/dL), post-ERCP instrumentation, hypercalcemia, and medications (azathioprine, valproate, thiazide diuretics).

Revised Atlanta Diagnosis requires >= 2 of 3 criteria: (1) acute persistent epigastric pain radiating to the back, (2) serum lipase (preferred over amylase for specificity) >= 3 times the upper limit of normal, (3) characteristic pancreatic parenchymal inflammation on contrast-enhanced CT or MRI.

Acute Management: Moderate goal-directed Lactated Ringer's crystalloid resuscitation (preferred over 0.9% normal saline to prevent hyperchloremic acidosis and reduce SIRS), early oral low-fat enteral feeding within 24 hours as tolerated, avoidance of prophylactic antibiotics in sterile pancreatic necrosis, urgent ERCP within 24 hours ONLY if concurrent acute ascending cholangitis is present, and same-admission laparoscopic cholecystectomy for mild gallstone pancreatitis.`,
  },
  {
    pageNumber: 12,
    chapterTitle: 'Chapter 12 (Page 12): Upper Gastrointestinal Bleeding & Variceal Hemorrhage',
    text: `Chapter 12 (Page 12): Upper Gastrointestinal Bleeding & Variceal Hemorrhage

Upper gastrointestinal bleeding originates proximal to the ligament of Treitz (peptic ulcer disease, gastroesophageal varices, Mallory-Weiss tear) and presents with hematemesis, coffee-ground emesis, or melena accompanied by an elevated BUN/Creatinine ratio (> 30:1 from intestinal absorption of digested hemoglobin protein).

Hemodynamic Resuscitation Protocol: Place two large-bore (>= 18-gauge) peripheral IV catheters, infuse isotonic crystalloid, and transfuse packed red blood cells using a restrictive hemoglobin threshold < 7 g/dL (< 8 g/dL in acute coronary artery disease)—overtransfusion elevates portal venous pressure and precipitates variceal rebleeding!

Suspected Cirrhotic Variceal Hemorrhage: Immediately initiate IV octreotide (splanchnic vasoconstrictor), IV proton pump inhibitor, AND prophylactic IV ceftriaxone (proven to reduce bacterial infections, recurrent bleeding, and in-hospital mortality), followed by urgent esophagogastroduodenoscopy (EGD) with endoscopic variceal band ligation within 12 hours.`,
  },
  {
    pageNumber: 13,
    chapterTitle: 'Chapter 13 (Page 13): Cirrhosis, Spontaneous Bacterial Peritonitis & Hepatic Encephalopathy',
    text: `Chapter 13 (Page 13): Cirrhosis, Spontaneous Bacterial Peritonitis & Hepatic Encephalopathy

Decompensated hepatic cirrhosis manifests with portal hypertension (ascites, gastroesophageal varices, splenomegaly) and hepatic synthetic failure (elevated INR, hypoalbuminemia, hyperbilirubinemia). Diagnostic paracentesis showing a Serum-Ascites Albumin Gradient (SAAG) >= 1.1 g/dL confirms portal hypertension as the etiology of ascites.

Spontaneous Bacterial Peritonitis (SBP): Perform diagnostic paracentesis promptly in ALL hospitalized cirrhotic patients with ascites (fever, abdominal tenderness, or unexplained AKI/encephalopathy). An ascitic fluid absolute polymorphonuclear (PMN) leukocyte count >= 250 cells/mm3 confirms SBP! Treat immediately with an IV third-generation cephalosporin (cefotaxime or ceftriaxone) PLUS IV albumin (1.5 g/kg on day 1 and 1.0 g/kg on day 3 to prevent hepatorenal syndrome and reduce mortality).

Hepatic Encephalopathy: Asterixis and altered mentation precipitated by GI bleeding, SBP, hypokalemia/alkalosis, sedatives, or constipation. Correct the underlying trigger and titrate oral lactulose (goal 2-3 soft bowel movements daily; colonic acidification traps NH3 as non-absorbable NH4+) plus rifaximin.`,
  },
  {
    pageNumber: 14,
    chapterTitle: 'Chapter 14 (Page 14): Inflammatory Bowel Disease — Ulcerative Colitis vs. Crohn Disease',
    text: `Chapter 14 (Page 14): Inflammatory Bowel Disease — Ulcerative Colitis vs. Crohn Disease

Ulcerative Colitis (UC) involves continuous mucosal and submucosal inflammation starting invariably in the rectum and extending proximally no further than the cecum, presenting with bloody mucoid diarrhea, tenesmus, crypt abscesses, lead-pipe loss of haustra, and strong association with Primary Sclerosing Cholangitis and p-ANCA. Total proctocolectomy is curative for colonic disease.

Crohn Disease causes transmural discontinuous "skip" lesions anywhere from mouth to anus (terminal ileum and proximal colon most common, often sparing the rectum), noncaseating granulomas, cobblestone mucosa, creeping mesenteric fat, barium "string sign" strictures, perianal fistulas/abscesses, calcium oxalate nephrolithiasis, and terminal ileal vitamin B12/bile acid malabsorption.

Toxic Megacolon (transverse colonic dilation > 6 cm plus systemic toxicity/fever/tachycardia): Immediately discontinue opioids, anticholinergics, and loperamide; institute bowel rest, nasogastric decompression, IV hydrocortisone, broad-spectrum IV antibiotics, and urgent surgical consultation.`,
  },
  {
    pageNumber: 15,
    chapterTitle: 'Chapter 15 (Page 15): Acute Kidney Injury (AKI) — Prerenal, ATN & AIN',
    text: `Chapter 15 (Page 15): Acute Kidney Injury (AKI) — Prerenal, ATN & AIN

KDIGO defines Acute Kidney Injury as serum creatinine increase >= 0.3 mg/dL within 48 hours, increase to >= 1.5 times baseline within 7 days, or oliguria < 0.5 mL/kg/hr for >= 6 hours.

Pathophysiologic Classification & Urine Indices:
- Prerenal Azotemia: Decreased effective renal perfusion with structurally intact tubules avidly reabsorbing sodium and urea -> serum BUN/Cr > 20:1, Urine Na < 20 mEq/L, FENa < 1% (use FEUrea < 35% on loop diuretics), Urine osmolality > 500 mOsm/kg, bland hyaline casts.
- Acute Tubular Necrosis (ATN): Prolonged ischemia/sepsis or nephrotoxins (aminoglycosides, radiocontrast, cisplatin, myoglobinuria) causing tubular epithelial sloughing -> BUN/Cr 10-15:1, Urine Na > 40 mEq/L, FENa > 2%, Urine osmolality < 350 mOsm/kg, pathognomonic muddy brown granular casts.
- Acute Interstitial Nephritis (AIN): Hypersensitivity to beta-lactams, PPIs, NSAIDs, or sulfonamides -> fever, maculopapular rash, peripheral eosinophilia, sterile pyuria, and WBC casts.

Urgent Dialysis Indications (AEIOU): Refractory Acidosis (pH < 7.10), refractory Hyperkalemia (K+ > 6.5 mEq/L or ECG changes), dialyzable Intoxications (lithium, ethylene glycol, methanol, salicylates), diuretic-refractory Volume Overload, and symptomatic Uremia (pericarditis or encephalopathy).`,
  },
  {
    pageNumber: 16,
    chapterTitle: 'Chapter 16 (Page 16): Hyponatremia & Hyperkalemia Emergencies',
    text: `Chapter 16 (Page 16): Hyponatremia & Hyperkalemia Emergencies

Hyponatremia (Serum Na < 135 mEq/L): First exclude hyperglycemic translocation (serum Na drops 1.6-2.0 mEq/L per 100 mg/dL glucose elevation above 100 mg/dL). True hypotonic hyponatremia (< 275 mOsm/kg) is evaluated by clinical volume status. SIADH presents with clinical euvolemia, inappropriately concentrated urine (Urine Osm > 100 mOsm/kg), Urine Na > 40 mEq/L, and low serum uric acid.

Osmotic Demyelination Syndrome Safeguard: Raise chronic hyponatremia by NO MORE THAN 6-8 mEq/L per 24 hours! Overly rapid sodium correction causes irreversible central pontine myelinolysis ("locked-in" spastic quadriplegia and pseudobulbar palsy). Administer 3% hypertonic saline (100 mL IV bolus) ONLY for acute seizures, coma, or cerebral herniation.

Severe Hyperkalemia Protocol (K+ >= 6.5 mEq/L or peaked T waves / PR prolongation / widened QRS): (1) IV Calcium Gluconate FIRST to immediately stabilize cardiac myocyte membrane excitability; (2) IV Regular Insulin (10 units) + 50% Dextrose (plus nebulized albuterol) to shift K+ intracellularly; (3) Loop diuretics, gastrointestinal cation exchangers (patiromer or sodium zirconium cyclosilicate), or emergent hemodialysis to eliminate total-body potassium.`,
  },
  {
    pageNumber: 17,
    chapterTitle: 'Chapter 17 (Page 17): Diabetic Ketoacidosis (DKA) & HHS',
    text: `Chapter 17 (Page 17): Diabetic Ketoacidosis (DKA) & HHS

Diabetic ketoacidosis combines insulin deficiency with counter-regulatory glucagon, cortisol, and catecholamine excess, driving adipose lipolysis, hepatic beta-oxidation into ketoacids (beta-hydroxybutyrate and acetoacetate), high anion gap metabolic acidosis (pH < 7.30, HCO3 <= 18 mEq/L, Anion Gap > 12), and profound osmotic diuresis. SGLT2 inhibitors can precipitate euglycemic DKA with plasma glucose < 250 mg/dL.

Step-by-Step DKA Resuscitation & Potassium Safety Gate:
1. Infuse 1-1.5 L isotonic IV crystalloid (0.9% NaCl or balanced crystalloid) during the first hour.
2. CRITICAL POTASSIUM CHECK BEFORE INSULIN: If serum K+ < 3.3 mEq/L, HOLD IV INSULIN and replete IV potassium (20-40 mEq/hr) until K+ >= 3.3 mEq/L to prevent fatal hypokalemic ventricular arrhythmia! If K+ is 3.3-5.2 mEq/L, add 20-30 mEq KCl per liter of IV fluid alongside continuous IV regular insulin (0.1 units/kg/hr).
3. Add 5% dextrose (D5W with 0.45% NaCl) once serum glucose falls to 200 mg/dL while continuing IV insulin infusion until the anion gap closes (<= 12 mEq/L). Overlap subcutaneous basal insulin (glargine) by 1-2 hours BEFORE stopping IV insulin to prevent rebound ketosis.`,
  },
  {
    pageNumber: 18,
    chapterTitle: 'Chapter 18 (Page 18): Thyroid Storm & Myxedema Coma',
    text: `Chapter 18 (Page 18): Thyroid Storm & Myxedema Coma

Thyroid Storm is life-threatening hypermetabolic thyrotoxicosis triggered by infection, surgery, trauma, or acute iodine load, presenting with hyperpyrexia (> 39.5 C), tachyarrhythmias (atrial fibrillation), high-output heart failure, agitation/delirium, and GI vomiting/diarrhea/jaundice.

Strict Pharmacologic Sequence in Thyroid Storm:
1. Beta-blocker: Propranolol (controls adrenergic tachycardia and inhibits peripheral 5'-deiodinase T4-to-T3 conversion; avoid in severe decompensated HFrEF).
2. Thionamide: Propylthiouracil (PTU preferred acutely over methimazole because PTU blocks BOTH thyroid peroxidase hormone synthesis AND peripheral T4-to-T3 conversion).
3. Inorganic Iodine (Potassium iodide / Lugol solution): Administer AT LEAST 1 HOUR AFTER PTU to block hormone release via the Wolff-Chaikoff effect (administering iodine before PTU fuels new thyroid hormone synthesis — Jod-Basedow phenomenon!).
4. IV Hydrocortisone (100 mg every 8 hours): Blocks T4-to-T3 conversion and treats relative adrenal insufficiency.

Myxedema Coma: Hypothermia, bradycardia, hypoventilation (hypercapnia), hyponatremia, and obtundation. Treat immediately with IV levothyroxine + liothyronine AND empiric IV hydrocortisone BEFORE or alongside thyroid hormone until coexisting adrenal insufficiency is excluded!`,
  },
  {
    pageNumber: 19,
    chapterTitle: 'Chapter 19 (Page 19): Iron Deficiency Anemia vs. Anemia of Chronic Disease & B12',
    text: `Chapter 19 (Page 19): Iron Deficiency Anemia vs. Anemia of Chronic Disease & B12

Microcytic Anemia (MCV < 80 fL) Iron Studies Differential:
- Iron Deficiency Anemia (IDA): Low serum ferritin (< 30 ng/mL — single most specific diagnostic test!), low serum iron, ELEVATED Total Iron-Binding Capacity (TIBC / transferrin), low transferrin saturation (< 15%), and elevated RDW. Clinical Red Flag: In men > 50 years and postmenopausal women, confirmed iron deficiency anemia mandates bidirectional gastrointestinal endoscopy (colonoscopy + EGD) to exclude occult colorectal or gastric carcinoma!
- Anemia of Chronic Inflammation (ACD): Cytokine-driven hepcidin elevation blocks ferroportin iron export -> low serum iron, LOW TIBC, and normal-to-elevated serum ferritin (> 100 ng/mL).
- Thalassemia Trait: MCV disproportionately microcytic (< 70 fL) with normal or elevated RBC count (Mentzer index MCV/RBC < 13) and normal iron studies.

Macrocytic Megaloblastic Anemia (MCV > 100 fL, hypersegmented neutrophils >= 5 nuclear lobes): Vitamin B12 (cobalamin) deficiency elevates BOTH methylmalonic acid (MMA) and homocysteine and causes subacute combined degeneration of dorsal columns (loss of vibration/proprioception) and lateral corticospinal tracts; Folate deficiency elevates homocysteine ONLY with normal MMA.`,
  },
  {
    pageNumber: 20,
    chapterTitle: 'Chapter 20 (Page 20): Heparin-Induced Thrombocytopenia (HIT) & TTP',
    text: `Chapter 20 (Page 20): Heparin-Induced Thrombocytopenia (HIT) & TTP

Type II Heparin-Induced Thrombocytopenia (HIT) is mediated by IgG autoantibodies directed against Platelet Factor 4 (PF4)-heparin complexes, cross-linking platelet Fc-gamma-RIIa receptors and causing a >= 50% platelet drop 5-10 days after heparin exposure PLUS paradoxical life-threatening arterial and venous thrombosis! Calculate the 4Ts pretest probability score and confirm with anti-PF4 ELISA and serotonin release assay.

Immediate HIT Management: STOP ALL HEPARIN (including heparin line flushes and LMWH) AND immediately initiate a non-heparin anticoagulant—direct thrombin inhibitor (argatroban in renal failure; bivalirudin) or fondaparinux/DOAC. Never start warfarin until platelets recover > 150,000/uL (prevents warfarin-induced skin necrosis) and avoid routine platelet transfusions.

Thrombotic Thrombocytopenic Purpura (TTP): Severe deficiency or autoantibody inhibition of ADAMTS13 metalloprotease leaves ultra-large von Willebrand factor multimers intact, shearing erythrocytes (schistocytes, Coombs-negative microangiopathic hemolytic anemia, elevated LDH/indirect bilirubin) + severe thrombocytopenia + neurologic deficits/AKI/fever. Emergent plasma exchange (plasmapheresis) + high-dose glucocorticoids + caplacizumab is lifesaving; platelet transfusion is contraindicated!`,
  },
  {
    pageNumber: 21,
    chapterTitle: 'Chapter 21 (Page 21): Septic Shock & Acute Bacterial Meningitis',
    text: `Chapter 21 (Page 21): Septic Shock & Acute Bacterial Meningitis

Septic Shock is defined as sepsis with persistent hypotension requiring vasopressors to maintain Mean Arterial Pressure (MAP) >= 65 mmHg AND serum lactate > 2.0 mmol/L despite adequate volume resuscitation (30 mL/kg balanced crystalloid within the first 3 hours). Draw two sets of blood cultures prior to administering broad-spectrum IV antibiotics within 1 hour of recognition; norepinephrine is the first-line vasopressor (add vasopressin second-line).

Acute Bacterial Meningitis (fever, nuchal rigidity, altered mental status; CSF shows > 1,000 WBC/uL with neutrophilic predominance, CSF protein > 200 mg/dL, and CSF glucose < 40 mg/dL):
Perform non-contrast Head CT BEFORE lumbar puncture ONLY if the patient has immunocompromise, history of CNS mass/stroke, new-onset seizure, papilledema, altered consciousness, or focal neurologic deficit—if Head CT is indicated, draw blood cultures and administer empiric IV dexamethasone + IV antibiotics IMMEDIATELY BEFORE sending the patient to CT!

Empiric Meningitis Regimen: IV Ceftriaxone + IV Vancomycin (add IV Ampicillin for Listeria monocytogenes coverage if age > 50 years, immunocompromised, or pregnant) + IV Dexamethasone (reduces pneumococcal sensorineural hearing loss and neurologic mortality).`,
  },
  {
    pageNumber: 22,
    chapterTitle: 'Chapter 22 (Page 22): Systemic Lupus Erythematosus (SLE) & Lupus Nephritis',
    text: `Chapter 22 (Page 22): Systemic Lupus Erythematosus (SLE) & Lupus Nephritis

Systemic Lupus Erythematosus (SLE) is a multisystem autoimmune connective tissue disorder mediated by antinuclear autoantibodies and Type III immune-complex deposition. Screening Antinuclear Antibody (ANA >= 1:80) provides > 95% sensitivity; anti-double-stranded DNA (anti-dsDNA, whose titers rise during flares and lupus nephritis alongside falling C3 and C4 complement levels!) and anti-Smith (anti-Sm) provide high diagnostic specificity. Drug-induced lupus (hydralazine, procainamide, isoniazid, minocycline) features anti-histone antibodies and typically spares the kidneys and CNS.

Clinical Manifestations: Photosensitive malar butterfly rash (classically sparing the nasolabial folds!), scarring discoid rash, painless oral ulcers, non-erosive Jaccoud polyarthritis, serositis (pleuritis or pericarditis), immune cytopenias, antiphospholipid thrombosis or recurrent pregnancy loss, and diffuse proliferative Class IV lupus nephritis ("wire-loop" subendothelial immune deposits; renal biopsy guides mycophenolate mofetil or cyclophosphamide induction).

Foundational Therapy: ALL patients with SLE without contraindications should receive hydroxychloroquine (reduces flares, thrombosis, and all-cause mortality; requires baseline and periodic ophthalmologic retinal screening).`,
  },
  {
    pageNumber: 23,
    chapterTitle: 'Chapter 23 (Page 23): Acute Ischemic Stroke & Reperfusion Windows',
    text: `Chapter 23 (Page 23): Acute Ischemic Stroke & Reperfusion Windows

Acute ischemic stroke vascular localization: Middle Cerebral Artery (MCA) occlusion causes contralateral face and arm > leg hemiparesis/sensory loss, ipsilateral gaze preference, and Broca/Wernicke aphasia (dominant left hemisphere) or contralateral hemineglect (non-dominant right hemisphere). Anterior Cerebral Artery (ACA) occlusion causes contralateral leg > arm weakness and abulia. Lateral medullary (Wallenberg, PICA) syndrome causes dysphagia/hoarseness (nucleus ambiguus), ipsilateral Horner syndrome, ipsilateral facial pain/temperature loss, and contralateral body pain/temperature loss without extremity motor weakness.

Emergent Reperfusion Protocol:
1. Immediate non-contrast Head CT and fingerstick blood glucose to exclude intracranial hemorrhage and hypoglycemia stroke mimic before any antithrombotic therapy.
2. IV Alteplase (0.9 mg/kg, max 90 mg) or Tenecteplase within <= 4.5 hours of "last known well" time once blood pressure is safely < 185/110 mmHg and coagulopathy/hemorrhage are excluded. Withhold aspirin and heparin for 24 hours post-tPA until repeat CT excludes hemorrhagic conversion.
3. Endovascular mechanical thrombectomy up to 24 hours from last known well for anterior circulation Large Vessel Occlusion (internal carotid or proximal M1 MCA) with salvageable penumbra on CT perfusion.`,
  },
  {
    pageNumber: 24,
    chapterTitle: 'Chapter 24 (Page 24): Status Epilepticus & Guillain-Barre Syndrome',
    text: `Chapter 24 (Page 24): Status Epilepticus & Guillain-Barre Syndrome

Convulsive Status Epilepticus is defined operationally as continuous seizure activity lasting >= 5 minutes or >= 2 sequential seizures without recovery of baseline consciousness between episodes. Prolonged convulsive activity rapidly triggers neuronal excitotoxicity, hyperthermia, rhabdomyolysis, and lactic acidosis.

Time-Critical Status Epilepticus Protocol:
- 0-5 min: Stabilize airway/breathing/oxygenation, check fingerstick glucose (administer IV thiamine 100 mg BEFORE dextrose in malnourished or alcohol-use patients to prevent Wernicke encephalopathy!).
- 5-10 min (First-Line Benzodiazepine): Intravenous Lorazepam (0.1 mg/kg, max 4 mg/dose, may repeat once) — or Intramuscular Midazolam (10 mg) if IV access is not yet established.
- 10-20 min (Second-Line Antiseizure Load): IV Levetiracetam (60 mg/kg), IV Fosphenytoin (20 mg PE/kg), or IV Valproate (40 mg/kg).
- > 20-30 min (Refractory Status Epilepticus): Endotracheal intubation with continuous IV propofol, midazolam, or ketamine infusion guided by continuous EEG monitoring.

Guillain-Barre Syndrome (AIDP): Symmetric ascending areflexic paralysis 1-3 weeks after Campylobacter jejuni enteritis; CSF demonstrates albuminocytologic dissociation (elevated CSF protein with normal WBC count < 5 cells/uL). Serially monitor Forced Vital Capacity (< 20 mL/kg) and Negative Inspiratory Force (worse than -30 cm H2O) to anticipate respiratory failure; treat with IVIG or plasmapheresis (systemic corticosteroids are ineffective!).`,
  },
];

const COMPENDIUM_PASSAGES = chunkPagesIntoPassages(COMPENDIUM_PAGES);

export const SAMPLE_COMPENDIUM_BOOK: MedicalTextbook = {
  id: 'compendium-internal-med-2026',
  title: 'Principles of Internal Medicine: Clinical Compendium (24 Chapters)',
  subject: 'Internal Medicine',
  fileName: 'Sample_Medical_Compendium.pdf',
  pageCount: COMPENDIUM_PAGES.length,
  passageCount: COMPENDIUM_PASSAGES.length,
  uploadedAt: '2026-10-01T09:00:00.000Z',
  fileSizeBytes: 512_400,
  isSample: true,
  pages: COMPENDIUM_PAGES,
};

const PAGE_2_PASSAGES = COMPENDIUM_PASSAGES.filter((p) => p.pageNumber === 2).map((p) => ({
  ...p,
  textbookId: SAMPLE_COMPENDIUM_BOOK.id,
  textbookTitle: SAMPLE_COMPENDIUM_BOOK.title,
  citationTag: 'B1:2',
  score: 26.4,
  matchedTerms: ['heart failure', 'hfref', 'adhf', 'decompensated'],
}));

const PHARM_PAGE_1_PASSAGES = chunkPagesIntoPassages(SAMPLE_PHARMACOLOGY_BOOK.pages)
  .filter((p) => p.pageNumber === 1)
  .slice(0, 2)
  .map((p) => ({
    ...p,
    passageId: `pharm-${p.passageId}`,
    textbookId: SAMPLE_PHARMACOLOGY_BOOK.id,
    textbookTitle: SAMPLE_PHARMACOLOGY_BOOK.title,
    citationTag: 'B2:1',
    score: 24.8,
    matchedTerms: ['furosemide', 'sacubitril', 'dapagliflozin', 'dobutamine'],
  }));

export const INITIAL_SAVED_GUIDE: StudyGuide = {
  id: 'guide-sample-adhf-2026',
  textbookId: SAMPLE_COMPENDIUM_BOOK.id,
  textbookTitle: `${SAMPLE_COMPENDIUM_BOOK.title} + ${SAMPLE_PHARMACOLOGY_BOOK.title}`,
  sourceTextbooks: [
    {
      id: SAMPLE_COMPENDIUM_BOOK.id,
      title: SAMPLE_COMPENDIUM_BOOK.title,
      subject: SAMPLE_COMPENDIUM_BOOK.subject,
      pageCount: SAMPLE_COMPENDIUM_BOOK.pageCount,
    },
    {
      id: SAMPLE_PHARMACOLOGY_BOOK.id,
      title: SAMPLE_PHARMACOLOGY_BOOK.title,
      subject: SAMPLE_PHARMACOLOGY_BOOK.subject,
      pageCount: SAMPLE_PHARMACOLOGY_BOOK.pageCount,
    },
  ],
  bookCitations: [
    {
      textbookId: SAMPLE_COMPENDIUM_BOOK.id,
      textbookTitle: SAMPLE_COMPENDIUM_BOOK.title,
      pageNumbers: [2],
    },
    {
      textbookId: SAMPLE_PHARMACOLOGY_BOOK.id,
      textbookTitle: SAMPLE_PHARMACOLOGY_BOOK.title,
      pageNumbers: [1],
    },
  ],
  topic: 'Acute Decompensated Heart Failure & HFrEF Management',
  summary:
    'Heart failure with reduced ejection fraction (HFrEF, LVEF <= 40%) is driven by systolic dysfunction and maladaptive RAAS/sympathetic activation, whereas HFpEF (LVEF >= 50%) reflects concentric diastolic stiffness. Acute decompensation is triaged by bedside perfusion-congestion profiles, and chronic HFrEF survival rests on four foundational medication pillars.',
  summaryArabic:
    'فشل القلب ذو الكسر القذفي المنخفض Heart Failure with Reduced Ejection Fraction (HFrEF, LVEF <= 40%) بيحصل بسبب ضعف انقباض عضلة القلب Systolic Dysfunction مع تنشيط ضار لنظام RAAS والجهاز السمبثاوي، بينما HFpEF (LVEF >= 50%) سببه تيبّس العضلة وضعف الارتخاء Diastolic Stiffness. في الطوارئ بنقسم الحالات الحادة حسب الـ Perfusion والـ Congestion، والعلاج المزمن لتقليل الوفيات بيعتمد على 4 أدوية أساسية (Four Pillars of GDMT).',
  quickRevisionBullets: [
    'Normal Physiology: Stroke Volume depends on Preload (Frank-Starling stretch), Myocardial Contractility, and Afterload resistance.',
    'HFrEF (LVEF <= 40%): Systolic pump failure + eccentric remodeling + S3 gallop + neurohormonal RAAS/beta-1 activation (Principles of Internal Medicine, p. 2).',
    'HFpEF (LVEF >= 50%): Diastolic filling stiffness + concentric LV hypertrophy + S4 gallop (Principles of Internal Medicine, p. 2).',
    'BNP Pitfall: Severe obesity falsely lowers serum BNP; chronic kidney disease (CKD) elevates baseline BNP (Principles of Internal Medicine, p. 2).',
    'Warm & Wet ADHF (~70%): IV loop diuretic (NKCC2 block + rapid venodilation) + nitroglycerin + BiPAP/CPAP (Internal Medicine, p. 2 · Pharmacology Atlas, p. 1).',
    'Cold & Wet Cardiogenic Shock: Stabilize with inotropes (dobutamine beta-1 or milrinone PDE-3); AVOID acute beta-blockers (Internal Medicine, p. 2 · Pharmacology Atlas, p. 1).',
    '4 Mortality-Reducing GDMT Pillars: ARNI (36-h ACEi washout!), evidence-based beta-blocker, MRA (K+ < 5.0, eGFR > 30), and SGLT2i (Internal Medicine, p. 2 · Pharmacology Atlas, p. 1).',
  ],
  coverage: 'strong',
  coverageNote: `Directly supported across 2 selected textbooks: "${SAMPLE_COMPENDIUM_BOOK.title}" (p. 2) and "${SAMPLE_PHARMACOLOGY_BOOK.title}" (p. 1) — searched all 36 combined indexed pages. Step 01 adds foundational normal cardiac physiology clearly labeled as Supplementary Medical Knowledge.`,
  totalPagesSearched: SAMPLE_COMPENDIUM_BOOK.pageCount + SAMPLE_PHARMACOLOGY_BOOK.pageCount,
  referencedPages: [2],
  retrievedPassages: [...PAGE_2_PASSAGES, ...PHARM_PAGE_1_PASSAGES],
  sections: [
    {
      stepNumber: 1,
      stepPhase: 'Normal Physiology',
      heading: '01. Normal Ventricular Physiology & Frank-Starling Mechanics',
      content:
        'Before understanding heart failure, review normal cardiac output (CO = Heart Rate × Stroke Volume). In a healthy left ventricle, venous return fills the chamber during diastole (preload), stretching sarcomeres to generate optimal contractile force via the Frank-Starling mechanism, and ejects >= 55% of end-diastolic volume (Left Ventricular Ejection Fraction, LVEF) against systemic arterial resistance (afterload). Normally, renal perfusion and arterial baroreceptors keep the Renin-Angiotensin-Aldosterone System (RAAS) and sympathetic tone balanced.',
      contentArabic:
        'قبل ما نفهم فشل القلب، لازم نراجع الفسيولوجيا الطبيعية: الـ Cardiac Output بيساوي ضربات القلب × كمية الدم في النبضة (Stroke Volume). في القلب السليم، الدم الراجع يملأ البطين الأيسر وقت الانبساط (Preload) ويمدد الألياف العضلية حسب قانون Frank-Starling عشان يضخ أكتر من 55% من الدم (LVEF) ضد مقاومة الشرايين (Afterload)، مع توازن طبيعي في نظام RAAS.',
      quickSummaryPoints: [
        'Cardiac Output = Heart Rate × Stroke Volume (governed by Preload, Contractility, Afterload).',
        'Normal LVEF is >= 55%; sarcomere stretch increases stroke volume via the Frank-Starling law.',
      ],
      termDefinitions: [
        {
          term: 'Preload (End-Diastolic Volume)',
          simpleExplanation: 'The volume of blood stretching the ventricle right before it contracts.',
          arabicExplanation: 'كمية الدم اللي بتمدد البطين قبل الانقباض مباشرة (الحمل القبلي).',
        },
        {
          term: 'Afterload (Systemic Vascular Resistance)',
          simpleExplanation: 'The arterial pressure/resistance the left ventricle must push against to eject blood.',
          arabicExplanation: 'المقاومة وضغط الشرايين اللي البطين الأيسر بيضخ الدم ضدها (الحمل البعدي).',
        },
        {
          term: 'Ejection Fraction (LVEF)',
          simpleExplanation: 'Percentage of blood in the left ventricle pumped out with each heartbeat.',
          arabicExplanation: 'نسبة الدم اللي البطين الأيسر بيضخها في كل نبضة مقارنة بحجم الدم الكلي داخله.',
        },
      ],
      pageNumbers: [],
      sourceBasis: 'general_medical_knowledge',
      keyTakeaway:
        'Normal stroke volume relies on compliant diastolic filling, intact systolic contractility, and balanced preload/afterload.',
      keyTakeawayArabic:
        'كفاءة ضخ القلب الطبيعية بتعتمد على مرونة الامتلاء الانبساطي وقوة الانقباض وتوازن الـ Preload والـ Afterload.',
    },
    {
      stepNumber: 2,
      stepPhase: 'Pathophysiology & Mechanism',
      heading: '02. Pathophysiology: HFrEF vs. HFpEF & Neurohormonal Remodeling',
      content:
        'Heart failure with reduced ejection fraction (HFrEF, LVEF <= 40%) is driven by impaired systolic contractility, thin-walled eccentric ventricular remodeling, an S3 ventricular gallop, and chronic maladaptive activation of RAAS (angiotensin II vasoconstriction + aldosterone sodium/water retention) and sympathetic beta-1 signaling. Conversely, Heart Failure with Preserved Ejection Fraction (HFpEF, LVEF >= 50%) results from concentric ventricular hypertrophy, impaired diastolic relaxation (stiffness), and an S4 atrial gallop.',
      contentArabic:
        'في الـ HFrEF (LVEF <= 40%) المشكلة الأساسية هي ضعف الانقباض Systolic Dysfunction مع تمدد البطين Eccentric Remodeling وصوت S3 gallop، والجسم بيرد بتنشيط مزمن وضار لـ RAAS والـ Sympathetic beta-1 فيزيد احتباس الصوديوم والمياه ويزيد العبء على القلب. أما في الـ HFpEF (LVEF >= 50%) فالانقباض محفوظ لكن العضلة سميكة ومتيبسة Concentric Hypertrophy مع ضعف الانبساط وصوت S4 gallop.',
      quickSummaryPoints: [
        'HFrEF (LVEF <= 40%): Systolic dysfunction, eccentric remodeling, S3 gallop, maladaptive RAAS & beta-1 activation.',
        'HFpEF (LVEF >= 50%): Diastolic stiffness, concentric hypertrophy, S4 gallop.',
      ],
      termDefinitions: [
        {
          term: 'Eccentric Remodeling',
          simpleExplanation: 'Dilatation and thinning of the ventricular chamber due to chronic volume overload or myocyte loss.',
          arabicExplanation: 'اتساع وترقق جدار البطين نتيجة ضعف العضلة وزيادة حجم الدم المحتبس.',
        },
        {
          term: 'S3 vs. S4 Gallop',
          simpleExplanation: 'S3 reflects rapid filling into a dilated volume-overloaded ventricle (HFrEF); S4 reflects atrial contraction into a stiff ventricle (HFpEF).',
          arabicExplanation: 'صوت S3 بيظهر مع توسع البطين في HFrEF، بينما S4 بيسمع لما الأذين ينقبض ضد بطين متيبس في HFpEF.',
        },
      ],
      pageNumbers: [2],
      sourceBasis: 'textbook',
      supportingQuote:
        'Heart failure with reduced ejection fraction (HFrEF, LVEF <= 40%) involves systolic dysfunction, eccentric remodeling, an S3 gallop, and maladaptive neurohormonal activation of RAAS and sympathetic beta-1 signaling.',
      keyTakeaway:
        'HFrEF (LVEF <= 40%) stems from systolic pump failure and RAAS/sympathetic remodeling, whereas HFpEF (LVEF >= 50%) stems from concentric diastolic stiffness.',
      keyTakeawayArabic:
        'الـ HFrEF سببه ضعف الانقباض وتنشيط RAAS، بينما الـ HFpEF سببه تيبس البطين وضعف الارتخاء الانبساطي.',
    },
    {
      stepNumber: 3,
      stepPhase: 'Clinical Presentation & Diagnosis',
      heading: '03. Clinical Presentation, Bedside Profiles & BNP Diagnostics',
      content:
        'Acute Decompensated Heart Failure (ADHF) is classified at the bedside along two axes: congestion ("Wet" vs. "Dry") and tissue perfusion ("Warm" vs. "Cold"). Warm-and-Wet pulmonary edema (~70% of acute cases) presents with orthopnea, paroxysmal nocturnal dyspnea, bibasilar crackles (rales), elevated jugular venous pressure (JVP), and warm extremities. Cold-and-Wet cardiogenic shock presents with cool clammy extremities, narrow pulse pressure, oliguria, and lactic acidosis. Ventricular wall stretch releases BNP and NT-proBNP; importantly, severe obesity lowers measured serum BNP while chronic kidney disease elevates baseline BNP.',
      contentArabic:
        'في الطوارئ بنقيّم مريض الـ ADHF حسب الاحتقان (Wet/Dry) والتروية الدموية للأطراف (Warm/Cold). أشهر صورة (~70%) هي Warm-and-Wet وبتيجي بنهجان عند الاستلقاء Orthopnea، وخرخشة في الرئة Bibasilar Rales، وارتفاع JVP مع أطراف دافية. أما Cold-and-Wet Cardiogenic Shock فبتيجي بأطراف باردة، قلة بول Oliguria، وارتفاع Lactate. تحليل BNP و NT-proBNP بيزيد مع تمدد البطين، بس خلي بالك السمنة المفرطة بتقلل رقم الـ BNP الكاذب، بينما الفشل الكلوي المزمن CKD بيرفعه.',
      quickSummaryPoints: [
        'Warm & Wet (~70%): Orthopnea, bibasilar rales, elevated JVP, warm extremities.',
        'Cold & Wet (Cardiogenic Shock): Cool clammy skin, narrow pulse pressure, oliguria, elevated lactate.',
        'Diagnostics: Transthoracic echocardiogram (LVEF), BNP/NT-proBNP (falsely low in obesity; elevated in CKD).',
      ],
      termDefinitions: [
        {
          term: 'Orthopnea',
          simpleExplanation: 'Shortness of breath when lying flat caused by venous blood redistributing from the legs into pulmonary vessels.',
          arabicExplanation: 'ضيق التنفس عند الاستلقاء بسبب رجوع الدم الوريدي للرئتين المحتقنتين.',
        },
        {
          term: 'Narrow Pulse Pressure',
          simpleExplanation: 'Small difference between systolic and diastolic BP (< 25% of systolic), signaling severely reduced stroke volume.',
          arabicExplanation: 'تقارب الضغط الانقباضي والانبساطي كعلامة خطيرة على ضعف الـ Stroke Volume في الصدمة القلبية.',
        },
      ],
      pageNumbers: [2],
      sourceBasis: 'textbook',
      supportingQuote:
        'Ventricular wall stretch releases BNP and NT-proBNP (note: severe obesity lowers serum BNP; chronic kidney disease elevates baseline BNP).',
      keyTakeaway:
        'Always interpret serum BNP alongside body habitus and renal function: severe obesity lowers BNP whereas CKD elevates baseline BNP.',
      keyTakeawayArabic:
        'فسّر نتيجة الـ BNP دايماً حسب حالة المريض: السمنة المفرطة بتقلل الـ BNP، وأمراض الكلى المزمنة CKD بترفع مستواه.',
    },
    {
      stepNumber: 4,
      stepPhase: 'Differential Diagnosis',
      heading: '04. Differential Diagnosis of Acute Dyspnea & Edema',
      content:
        'When a patient presents with acute dyspnea, hypoxemia, or bilateral leg edema, clinicians must distinguish cardiogenic pulmonary edema from Acute Exacerbation of COPD/Asthma (wheezing, hyperinflation, normal JVP/BNP), Acute Pulmonary Embolism (sudden pleuritic chest pain, tachycardia, clear lungs, CT angiography filling defect), Non-cardiogenic ARDS (normal PCWP <= 18 mmHg, sepsis/trauma trigger), and Cirrhotic or Nephrotic Edema (hypoalbuminemia, flat JVP).',
      contentArabic:
        'لما يجيلك مريض بنهجان حاد أو تورم في الرجلين، لازم تفرّق الـ Cardiogenic Pulmonary Edema عن أزمات الـ COPD والربو (تزييق بالصدر و BNP طبيعي)، والجلطة الرئوية Pulmonary Embolism (ألم مفاجئ بالصدر مع فحص رئة سليم)، ومتلازمة ARDS (ارتشاح رئوي غير قلبي بسبب عدوى شديدة)، وتورم الكبد أو المتلازمة النفروزية Nephrotic Syndrome (نقص الألبومين مع JVP غير مرتفع).',
      quickSummaryPoints: [
        'Rule out COPD/Asthma flare (normal BNP/JVP, expiratory wheeze) and Pulmonary Embolism (clear lungs, sudden tachycardia).',
        'Distinguish ARDS (non-cardiogenic capillary leak) and nephrotic/cirrhotic volume overload.',
      ],
      pageNumbers: [],
      sourceBasis: 'general_medical_knowledge',
      keyTakeaway:
        'Elevated JVP, an S3 gallop, and markedly elevated BNP/NT-proBNP strongly favor cardiogenic pulmonary edema over primary airway disease.',
      keyTakeawayArabic:
        'ارتفاع الـ JVP ووجود S3 gallop وارتفاع الـ BNP بيرجحوا الاحتقان الرئوي القلبي عن أمراض الشعب الهوائية.',
    },
    {
      stepNumber: 5,
      stepPhase: 'Stepwise Management',
      heading: '05. Acute Stabilization & Four-Pillar Chronic HFrEF GDMT',
      content:
        'For acute Warm-and-Wet pulmonary edema, administer intravenous loop diuretics (furosemide, bumetanide, or torsemide), add intravenous nitroglycerin if hypertensive, and apply BiPAP/CPAP noninvasive ventilation (which reduces both LV preload and afterload). For Cold-and-Wet cardiogenic shock, stabilize perfusion with inotropes (dobutamine or milrinone) and strictly avoid acute beta-blockers.\n\nOnce euvolemic, chronic HFrEF survival depends on Four Mortality-Reducing GDMT Pillars: (1) ARNI (sacubitril-valsartan after a mandatory 36-hour ACE inhibitor washout to prevent angioedema) or ACEi/ARB, (2) Evidence-based beta-blocker (carvedilol, metoprolol succinate, or bisoprolol — never start during acute shock), (3) Mineralocorticoid receptor antagonist (spironolactone or eplerenone if K+ < 5.0 mEq/L and eGFR > 30 mL/min), and (4) SGLT2 inhibitor (dapagliflozin or empagliflozin regardless of diabetes status). Loop diuretics relieve congestion symptoms without reducing mortality.',
      contentArabic:
        'في حالات الطوارئ Warm-and-Wet: ابدأ فوراً بـ IV Loop Diuretics (مثل Furosemide)، مع Nitroglycerin لو الضغط عالي، وجهاز BiPAP/CPAP لأنه بيقلل الـ Preload والـ Afterload مع بعض. أما في الـ Cold-and-Wet Cardiogenic Shock فبنعطي Inotropes (مثل Dobutamine أو Milrinone) وممنوع تماماً إعطاء Beta-blockers وقت الصدمة.\n\nبعد استقرار السوائل، علاج الـ HFrEF المزمن لتقليل الوفيات بيقوم على 4 أعمدة (Four GDMT Pillars): (1) دواء ARNI (Sacubitril-Valsartan بشرط إيقاف الـ ACEi لمدة 36 ساعة كاملة لمنع الـ Angioedema)، (2) أحد الـ Beta-blockers المعتمدة (Carvedilol أو Metoprolol Succinate أو Bisoprolol)، (3) مضاد الألدوستيرون MRA (بشرط البوتاسيوم أقل من 5.0 و eGFR أعلى من 30)، و(4) مثبطات SGLT2 (Dapagliflozin أو Empagliflozin حتى لو المريض مش مريض سكر). مدرات البول بتحسن الأعراض فقط ولا تقلل الوفيات.',
      quickSummaryPoints: [
        'Acute Warm & Wet: IV loop diuretic + IV nitroglycerin (if hypertensive) + BiPAP/CPAP.',
        'Acute Cold & Wet: Inotropes (dobutamine/milrinone); hold beta-blockers.',
        'Chronic 4 GDMT Pillars: ARNI (36-h ACEi washout) + Carvedilol/Metoprolol succinate/Bisoprolol + Spironolactone/Eplerenone + Dapagliflozin/Empagliflozin.',
      ],
      termDefinitions: [
        {
          term: 'ARNI (Sacubitril-Valsartan)',
          simpleExplanation: 'Combines an ARB with a neprilysin inhibitor that preserves beneficial natriuretic peptides; requires a 36-hour washout from ACE inhibitors.',
          arabicExplanation: 'دواء يجمع بين ARB ومثبط Neprilysin لزيادة مواد توسيع الأوعية الطبيعية، ويلزم فترة توقف 36 ساعة بعد الـ ACEi.',
        },
        {
          term: 'Inotropes (Dobutamine / Milrinone)',
          simpleExplanation: 'Intravenous medications that directly boost myocardial contractility during cardiogenic shock.',
          arabicExplanation: 'أدوية وريدية تقوي انقباض عضلة القلب مباشرة في حالات الصدمة القلبية.',
        },
      ],
      pageNumbers: [2],
      bookCitations: [
        {
          textbookId: SAMPLE_COMPENDIUM_BOOK.id,
          textbookTitle: SAMPLE_COMPENDIUM_BOOK.title,
          pageNumbers: [2],
        },
        {
          textbookId: SAMPLE_PHARMACOLOGY_BOOK.id,
          textbookTitle: SAMPLE_PHARMACOLOGY_BOOK.title,
          pageNumbers: [1],
        },
      ],
      sourceBasis: 'textbook',
      supportingQuote:
        'Four GDMT Mortality-Reducing Pillars for Chronic HFrEF: (1) ARNI (sacubitril-valsartan after a strict 36-hour ACE inhibitor washout to prevent angioedema) or ACEi/ARB, (2) Evidence-based beta-blocker (carvedilol, metoprolol succinate, or bisoprolol — only initiate when euvolemic), (3) Mineralocorticoid receptor antagonist (spironolactone or eplerenone if K+ < 5.0 mEq/L and eGFR > 30), and (4) SGLT2 inhibitor (dapagliflozin or empagliflozin regardless of diabetes status).',
      keyTakeaway:
        'Loop diuretics relieve congestion only; long-term survival in HFrEF requires all four GDMT pillars with a strict 36-hour washout between ACEi and ARNI.',
      keyTakeawayArabic:
        'مدرات البول للأعراض فقط؛ إطالة عمر مريض الـ HFrEF تعتمد على الـ 4 أدوية الأساسية مع الالتزام بـ 36 ساعة فاصل بين ACEi و ARNI.',
    },
  ],
  clinicalNotes: [
    {
      title: 'Cold & Wet Cardiogenic Shock Caution',
      category: 'Red Flag',
      detail:
        'Avoid acute beta-blockers in Cold-and-Wet cardiogenic shock (cool clammy extremities, narrow pulse pressure, oliguria, lactic acidosis); stabilize perfusion first with dobutamine or milrinone.',
      detailArabic:
        'ممنوع البدء بـ Beta-blockers في حالات الصدمة القلبية (Cold & Wet)؛ يجب دعم التروية أولاً بـ Dobutamine أو Milrinone.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
      supportingQuote:
        'Cold-and-Wet cardiogenic shock presents with cool clammy extremities, narrow pulse pressure, oliguria, and lactic acidosis—stabilize with inotropes (dobutamine or milrinone) and avoid acute beta-blockers.',
    },
    {
      title: 'ACEi to ARNI 36-Hour Washout Rule',
      category: 'Management Protocol',
      detail:
        'Enforce a strict 36-hour washout window after discontinuing an ACE inhibitor before starting sacubitril-valsartan to prevent bradykinin-mediated angioedema.',
      detailArabic:
        'يجب الانتظار 36 ساعة كاملة بعد إيقاف الـ ACE inhibitor قبل إعطاء أول جرعة Sacubitril-Valsartan لتجنب حدوث Angioedema مهددة للحياة.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
      supportingQuote:
        'sacubitril-valsartan after a strict 36-hour ACE inhibitor washout to prevent angioedema',
    },
    {
      title: 'BNP Interpretation in Obesity vs. CKD',
      category: 'Diagnostic Pitfall',
      detail:
        'Severe obesity lowers measured serum BNP levels despite true pulmonary congestion, whereas chronic kidney disease raises baseline BNP.',
      detailArabic:
        'السمنة المفرطة تخفض مستوى الـ BNP رغم وجود احتقان حقيقي، بينما الفشل الكلوي المزمن يرفع مستواه القاعدي.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
    {
      title: 'MRA Potassium & Renal Thresholds',
      category: 'Clinical Pearl',
      detail:
        'Verify serum potassium is < 5.0 mEq/L and eGFR > 30 mL/min before starting spironolactone or eplerenone.',
      detailArabic:
        'تأكد أن البوتاسيوم أقل من 5.0 mEq/L وكفاءة الكلى eGFR أعلى من 30 قبل بدء Spironolactone أو Eplerenone.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
  ],
  mindMap: {
    centralTopic: 'Heart Failure & ADHF',
    centralSubtitle: 'Textbook p. 2 Concept Map',
    nodes: [
      {
        id: 'mm-1',
        label: 'Normal Cardiac Output',
        category: 'physiology',
        relationLabel: 'baseline',
        summary: 'Stroke volume depends on preload (Frank-Starling), contractility, and afterload.',
        sourceBasis: 'general_medical_knowledge',
        pageNumbers: [],
      },
      {
        id: 'mm-2',
        label: 'HFrEF (LVEF ≤ 40%)',
        category: 'pathophysiology',
        relationLabel: 'systolic failure',
        summary: 'Eccentric remodeling, S3 gallop, and maladaptive RAAS + sympathetic beta-1 activation.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'mm-2a',
        label: 'HFpEF (LVEF ≥ 50%)',
        category: 'pathophysiology',
        relationLabel: 'vs diastolic',
        parentId: 'mm-2',
        summary: 'Concentric LV hypertrophy, diastolic relaxation stiffness, and S4 gallop.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'mm-3',
        label: 'Bedside ADHF Profiles',
        category: 'clinical',
        relationLabel: 'triaged into',
        summary: 'Warm & Wet (~70% pulmonary edema) vs Cold & Wet (cardiogenic shock with lactic acidosis).',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'mm-4',
        label: 'BNP / NT-proBNP & Echo',
        category: 'diagnosis',
        relationLabel: 'evaluated via',
        summary: 'Wall stretch releases BNP; lowered in severe obesity and elevated in CKD.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'mm-5',
        label: '4 Pillars of Chronic GDMT',
        category: 'management',
        relationLabel: 'mortality ↓',
        summary: 'ARNI (36-h ACEi washout), evidence-based beta-blocker, MRA, and SGLT2 inhibitor.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'mm-6',
        label: 'Shock & Angioedema Risks',
        category: 'complications',
        relationLabel: 'red flags',
        summary: 'Avoid beta-blockers in Cold-and-Wet shock; enforce 36-h ACEi washout before ARNI.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
    ],
  },
  flowcharts: [
    {
      id: 'flow-adhf-triage',
      title: 'Acute Decompensated Heart Failure (ADHF) Bedside Algorithm',
      flowType: 'management',
      sourceBasis: 'textbook',
      pageNumbers: [2],
      nodes: [
        {
          id: 'f1',
          label: 'Suspected Acute Heart Failure',
          detail: 'Assess dyspnea, JVP, lung rales, extremity warmth, BP, and lactate.',
          nodeType: 'start',
        },
        {
          id: 'f2',
          label: 'Assess Perfusion (Warm vs Cold)',
          detail: 'Check skin temperature, pulse pressure, urine output, and serum lactate.',
          nodeType: 'decision',
        },
        {
          id: 'f3',
          label: 'Warm & Wet (~70% Cases)',
          detail: 'Orthopnea, bibasilar rales, elevated JVP, preserved extremity perfusion.',
          nodeType: 'process',
        },
        {
          id: 'f4',
          label: 'Cold & Wet (Cardiogenic Shock)',
          detail: 'Cool clammy skin, narrow pulse pressure, oliguria, lactic acidosis.',
          nodeType: 'alert',
        },
        {
          id: 'f5',
          label: 'IV Loop Diuretic + BiPAP/CPAP + NTG',
          detail: 'Furosemide/bumetanide/torsemide; BiPAP reduces preload & afterload; NTG if hypertensive.',
          nodeType: 'action',
        },
        {
          id: 'f6',
          label: 'Inotropes & Hold Beta-Blockers',
          detail: 'Start dobutamine or milrinone; strictly avoid acute beta-blockade.',
          nodeType: 'action',
        },
      ],
      edges: [
        { from: 'f1', to: 'f2', label: 'Bedside Exam' },
        { from: 'f2', to: 'f3', label: 'Warm Perfusion' },
        { from: 'f2', to: 'f4', label: 'Cold / Hypoperfused' },
        { from: 'f3', to: 'f5', label: 'Decongest' },
        { from: 'f4', to: 'f6', label: 'Restore CO' },
      ],
    },
    {
      id: 'flow-hfref-patho',
      title: 'HFrEF Neurohormonal Pathophysiology Cascade',
      flowType: 'pathophysiology',
      sourceBasis: 'textbook',
      pageNumbers: [2],
      nodes: [
        {
          id: 'p1',
          label: 'Myocardial Injury / Systolic Dysfunction',
          detail: 'LVEF drops <= 40%, reducing forward stroke volume and renal perfusion.',
          nodeType: 'start',
        },
        {
          id: 'p2',
          label: 'RAAS & Sympathetic Beta-1 Activation',
          detail: 'Compensatory surge in renin, angiotensin II, aldosterone, and norepinephrine.',
          nodeType: 'process',
        },
        {
          id: 'p3',
          label: 'Vasoconstriction & Na+/Water Retention',
          detail: 'Increases both systemic afterload and venous preload congestion.',
          nodeType: 'process',
        },
        {
          id: 'p4',
          label: 'Eccentric Ventricular Remodeling & S3',
          detail: 'Progressive chamber dilatation, wall stretch (BNP release), and worsening LVEF.',
          nodeType: 'alert',
        },
      ],
      edges: [
        { from: 'p1', to: 'p2', label: 'Renal hypoperfusion' },
        { from: 'p2', to: 'p3', label: 'Ang II + Aldosterone' },
        { from: 'p3', to: 'p4', label: 'Wall stress ↑' },
      ],
    },
  ],
  anatomicalDiagram: {
    title: 'Cardiopulmonary Chambers, Hemodynamic Load & Neurohormonal Axis',
    systemTemplate: 'cardiopulmonary',
    normalPhysiologySummary:
      'Pulmonary veins deliver oxygenated blood to a compliant left ventricle, which ejects >= 55% of end-diastolic volume into the aorta at normal filling pressures.',
    pathophysiologySummary:
      'In HFrEF (p. 2), impaired LV contractility elevates left atrial and alveolar capillary hydrostatic pressures (pulmonary rales/orthopnea) while triggering renal RAAS sodium retention.',
    callouts: [
      {
        id: 'pin-1',
        number: 1,
        structureName: 'Left Ventricular Myocardium (LVEF)',
        xPercent: 58,
        yPercent: 58,
        normalRole: 'Contracts forcefully during systole to eject >= 55% of end-diastolic blood volume.',
        pathologicalChange:
          'HFrEF (LVEF <= 40%) shows eccentric dilatation & S3 gallop; HFpEF (LVEF >= 50%) shows stiff concentric hypertrophy & S4 gallop.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'pin-2',
        number: 2,
        structureName: 'Alveolar-Capillary Bed (Pulmonary Venous Load)',
        xPercent: 26,
        yPercent: 34,
        normalRole: 'Low pulmonary venous pressure keeps alveoli dry for rapid gas exchange.',
        pathologicalChange:
          'Elevated LV filling pressure backs up into pulmonary capillaries, causing Warm-and-Wet pulmonary edema, bibasilar rales, and orthopnea.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'pin-3',
        number: 3,
        structureName: 'Superior Vena Cava & Jugular Venous Column',
        xPercent: 40,
        yPercent: 22,
        normalRole: 'Returns systemic venous blood to the right atrium at low central venous pressure.',
        pathologicalChange:
          'Right-sided congestion elevates jugular venous pressure (JVP), a hallmark bedside sign of wet volume overload.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
      {
        id: 'pin-4',
        number: 4,
        structureName: 'Aortic Arch & Systemic Afterload',
        xPercent: 54,
        yPercent: 22,
        normalRole: 'Elastic recoil maintains forward organ perfusion without excessive LV wall tension.',
        pathologicalChange:
          'Angiotensin II vasoconstriction raises afterload; BiPAP/CPAP, nitroglycerin, and ARNI unload LV wall stress.',
        sourceBasis: 'textbook',
        pageNumbers: [2],
      },
    ],
  },
  comparisonTable: {
    title: 'Clinical Comparison: HFrEF vs. HFpEF & Acute Hemodynamic Profiles',
    columns: ['HFrEF (Systolic)', 'HFpEF (Diastolic)', 'Acute Cold & Wet Shock'],
    rows: [
      {
        feature: 'Ejection Fraction (LVEF)',
        cells: ['<= 40%', '>= 50%', 'Typically severely reduced'],
      },
      {
        feature: 'Ventricular Remodeling & Gallop',
        cells: ['Eccentric dilatation · S3 gallop', 'Concentric hypertrophy · S4 gallop', 'Dilated hypokinetic LV · narrow pulse pressure'],
      },
      {
        feature: 'Bedside Perfusion & Skin',
        cells: ['Warm in compensated / Warm-Wet', 'Warm extremities', 'Cool, clammy skin + oliguria + lactate ↑'],
      },
      {
        feature: 'Core Evidence-Based Therapy',
        cells: ['4 GDMT Pillars (ARNI, BB, MRA, SGLT2i)', 'SGLT2i + BP control + diuretics for congestion', 'Inotropes (dobutamine/milrinone); AVOID acute BB'],
      },
    ],
    sourceBasis: 'textbook',
    pageNumbers: [2],
  },
  clinicalCases: [
    {
      id: 'sample-case-1',
      title: 'Case 1: Nocturnal Dyspnea & Hypertensive Pulmonary Edema',
      patientPresentation:
        'A 66-year-old man with prior anterior MI and LVEF 30% presents to the ED at 2:00 AM gasping for air, unable to lie flat. He has warm hands, bilateral crackles halfway up both lung fields, and JVP of 15 cm H2O.',
      vitalsAndLabs:
        'BP 172/98 mmHg · HR 112 bpm · RR 28/min · SpO2 88% on room air · BMI 41 kg/m² · Serum BNP 145 pg/mL · Creatinine 1.0 mg/dL',
      promptQuestion:
        'How do you classify his bedside hemodynamic profile, why is his BNP only modestly elevated despite florid pulmonary edema, and what is your immediate three-part acute treatment?',
      idealWorkupAndDiagnosis:
        'Warm-and-Wet Acute Decompensated Heart Failure (hypertensive cardiogenic pulmonary edema). His severe obesity (BMI 41) falsely lowers measured serum BNP despite true elevated LV wall stress.',
      managementPlan:
        '1. Administer IV loop diuretic (furosemide/bumetanide). 2. Start IV nitroglycerin for rapid preload/afterload reduction given BP 172/98 mmHg. 3. Apply BiPAP/CPAP noninvasive ventilation to decrease both LV preload and afterload.',
      clinicalPearl:
        'Never rule out acute pulmonary edema solely on a borderline BNP in a patient with severe obesity.',
      arabicTakeaway:
        'المريض في حالة Warm-and-Wet ADHF؛ السمنة المفرطة (BMI 41) هي سبب انخفاض رقم الـ BNP نسبياً، والعلاج الفوري يشمل IV Furosemide + IV Nitroglycerin + BiPAP.',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
    {
      id: 'sample-case-2',
      title: 'Case 2: Transitioning Chronic HFrEF Therapy Safely',
      patientPresentation:
        'After 4 days of IV diuresis, the patient is euvolemic, breathing comfortably on room air, and ready for chronic GDMT optimization. Prior to admission he took lisinopril 20 mg daily and carvedilol.',
      vitalsAndLabs:
        'BP 118/74 mmHg · HR 68 bpm · Serum K+ 4.4 mEq/L · eGFR 58 mL/min/1.73m²',
      promptQuestion:
        'You plan to upgrade lisinopril to sacubitril-valsartan (ARNI) and complete his 4-pillar GDMT regimen. What mandatory safety timing rule and medication additions apply?',
      idealWorkupAndDiagnosis:
        'Eligible for full 4-pillar chronic HFrEF GDMT (euvolemic, K+ < 5.0 mEq/L, eGFR > 30 mL/min).',
      managementPlan:
        'Stop lisinopril and enforce a strict 36-hour washout window before giving the first dose of sacubitril-valsartan to prevent angioedema. Continue carvedilol, add spironolactone (MRA), and add dapagliflozin or empagliflozin (SGLT2i).',
      clinicalPearl:
        'Overlapping an ACE inhibitor with sacubitril-valsartan triggers severe bradykinin-mediated angioedema.',
      arabicTakeaway:
        'عند التحويل من Lisinopril إلى Sacubitril-Valsartan يجب التوقف 36 ساعة كاملة لمنع الـ Angioedema، مع استكمال باقي الـ Four Pillars (Carvedilol + Spironolactone + SGLT2i).',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
  ],
  flashcards: [
    {
      id: 'sample-fc-1',
      front: 'What LVEF cutoffs and gallop sounds distinguish HFrEF from HFpEF?',
      back: 'HFrEF: LVEF <= 40% with eccentric remodeling and S3 gallop. HFpEF: LVEF >= 50% with concentric hypertrophy and S4 gallop.',
      backArabic: 'الـ HFrEF كسره القذفي <= 40% مع S3 gallop، بينما الـ HFpEF كسره القذفي >= 50% مع S4 gallop.',
      category: 'Pathophysiology',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
    {
      id: 'sample-fc-2',
      front: 'How do severe obesity and chronic kidney disease (CKD) affect serum BNP levels?',
      back: 'Severe obesity lowers measured serum BNP; chronic kidney disease (CKD) elevates baseline serum BNP.',
      backArabic: 'السمنة المفرطة تخفّض مستوى الـ BNP، بينما الفشل الكلوي المزمن CKD يرفع مستواه.',
      category: 'Diagnostics',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
    {
      id: 'sample-fc-3',
      front: 'Name the 4 mortality-reducing GDMT medication classes for chronic HFrEF.',
      back: '1. ARNI (sacubitril-valsartan) or ACEi/ARB\n2. Evidence-based beta-blocker (carvedilol, metoprolol succinate, bisoprolol)\n3. MRA (spironolactone, eplerenone)\n4. SGLT2 inhibitor (dapagliflozin, empagliflozin)',
      backArabic: 'الأعمدة الأربعة: (1) ARNI أو ACEi/ARB، (2) Beta-blocker معتمد، (3) MRA مثل Spironolactone، و(4) SGLT2 inhibitor.',
      category: 'Management',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
    {
      id: 'sample-fc-4',
      front: 'What washout rule is mandatory when switching from an ACE inhibitor to sacubitril-valsartan?',
      back: 'A strict 36-hour washout period after stopping the ACE inhibitor to prevent bradykinin-mediated angioedema.',
      backArabic: 'فترة غسيل دوائي 36 ساعة كاملة بعد إيقاف الـ ACEi لمنع حدوث Angioedema.',
      category: 'Safety Protocol',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
    {
      id: 'sample-fc-5',
      front: 'What potassium and renal thresholds are required before starting spironolactone or eplerenone (MRA)?',
      back: 'Serum potassium (K+) must be < 5.0 mEq/L and eGFR must be > 30 mL/min.',
      backArabic: 'يشترط أن يكون البوتاسيوم أقل من 5.0 mEq/L ومعدل فلترة الكلى eGFR أعلى من 30.',
      category: 'Pharmacology',
      sourceBasis: 'textbook',
      pageNumbers: [2],
    },
  ],
  mcqs: [
    {
      id: 'sample-mcq-1',
      question:
        'A 68-year-old man with chronic HFrEF (LVEF 28%) presents with severe orthopnea, bibasilar rales, JVP of 14 cm H2O, BP 164/96 mmHg, and warm extremities. In addition to intravenous furosemide, which acute intervention reduces both left ventricular preload and afterload?',
      options: [
        'Immediate initiation of oral carvedilol',
        'BiPAP/CPAP ventilation and intravenous nitroglycerin',
        'Rapid 30 mL/kg isotonic crystalloid bolus',
        'Continuous intravenous dobutamine infusion',
      ],
      correctIndex: 1,
      explanation:
        'Warm-and-Wet hypertensive pulmonary edema responds rapidly to IV loop diuretics plus BiPAP/CPAP ventilation (which lowers both LV preload and afterload) and IV nitroglycerin.',
      explanationArabic:
        'في حالة Warm-and-Wet مع ارتفاع الضغط، جهاز BiPAP/CPAP مع IV Nitroglycerin بيقللوا الـ Preload والـ Afterload بسرعة بجانب الـ Furosemide.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
    {
      id: 'sample-mcq-2',
      question:
        'A 59-year-old woman with compensated HFrEF (LVEF 32%) is transitioning from lisinopril to sacubitril-valsartan. Which safety protocol is mandatory before administering the first dose of sacubitril-valsartan?',
      options: [
        'Overlap lisinopril and sacubitril-valsartan for 48 hours',
        'Observe a strict 36-hour washout period after stopping lisinopril',
        'Discontinue dapagliflozin permanently',
        'Switch metoprolol succinate to metoprolol tartrate',
      ],
      correctIndex: 1,
      explanation:
        'Page 2 specifies a strict 36-hour washout when switching from an ACE inhibitor to sacubitril-valsartan to prevent angioedema.',
      explanationArabic:
        'صفحة 2 تنص على ضرورة الانتظار 36 ساعة بعد إيقاف Lisinopril قبل بدء Sacubitril-Valsartan لمنع حدوث Angioedema.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
    {
      id: 'sample-mcq-3',
      question:
        'Which four medication classes comprise the mortality-reducing GDMT regimen for chronic HFrEF on Page 2?',
      options: [
        'Loop diuretic, digoxin, amlodipine, and aspirin',
        'ARNI, evidence-based beta-blocker, MRA, and SGLT2 inhibitor',
        'Furosemide, metoprolol tartrate, hydrochlorothiazide, and statin',
        'Verapamil, lisinopril, digoxin, and isosorbide mononitrate',
      ],
      correctIndex: 1,
      explanation:
        'The four GDMT mortality-reducing pillars for chronic HFrEF are ARNI (or ACEi/ARB), an evidence-based beta-blocker (carvedilol, metoprolol succinate, or bisoprolol), MRA (spironolactone/eplerenone), and SGLT2 inhibitor (dapagliflozin/empagliflozin).',
      explanationArabic:
        'الأدوية الأربعة التي تقلل الوفيات في HFrEF هي: ARNI، وBeta-blocker معتمد، وMRA، ومثبطات SGLT2.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
    {
      id: 'sample-mcq-4',
      question:
        'A 64-year-old man with cardiomyopathy presents with cool clammy extremities, oliguria, bibasilar rales, narrow pulse pressure (BP 84/68 mmHg), and elevated lactate. Which acute management is indicated?',
      options: [
        'Initiate oral bisoprolol immediately',
        'Stabilize with inotropes (dobutamine or milrinone) and avoid acute beta-blockers',
        'Administer high-dose IV nitroglycerin monotherapy',
        'Discharge on oral furosemide',
      ],
      correctIndex: 1,
      explanation:
        'This presentation defines Cold-and-Wet cardiogenic shock, requiring inotropic stabilization (dobutamine or milrinone) while avoiding acute beta-blockade.',
      explanationArabic:
        'هذه الصورة تمثل Cold-and-Wet Cardiogenic Shock وتستلزم إعطاء Inotropes (Dobutamine أو Milrinone) مع تجنب إعطاء Beta-blockers الحادة.',
      pageNumbers: [2],
      sourceBasis: 'textbook',
    },
  ],
  createdAt: '2026-10-20T14:30:00.000Z',
  updatedAt: '2026-10-20T14:30:00.000Z',
  answers: {},
  flashcardMastery: {},
};
