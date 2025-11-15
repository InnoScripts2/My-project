import { OnCallPlaybooks } from './OnCallPlaybooks.js';

const onCallPlaybooks = new OnCallPlaybooks();

const playbook = await onCallPlaybooks.getPlaybook('device_disconnected_obd');

if (playbook) {
  console.log('Playbook:', playbook.title);
  console.log('Estimated time:', playbook.estimatedTime, 'minutes');
  console.log('\nSymptoms:');
  playbook.symptoms.forEach((symptom, i) => {
    console.log(`  ${i + 1}. ${symptom}`);
  });
  console.log('\nDiagnosis steps:');
  playbook.diagnosis.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.step}`);
    if (step.command) console.log(`     Command: ${step.command}`);
    console.log(`     Expected: ${step.expectedOutput}`);
  });
  console.log('\nResolution steps:');
  playbook.resolution.forEach((step, i) => {
    console.log(`  ${i + 1}. ${step.step}`);
    if (step.command) console.log(`     Command: ${step.command}`);
    if (step.note) console.log(`     Note: ${step.note}`);
  });
  console.log('\nEscalation:', playbook.escalation);
} else {
  console.log('Playbook not found');
}
