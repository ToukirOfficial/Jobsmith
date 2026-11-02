'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { applicationSchema, type ApplicationDetail } from '@jobsmith/shared';
import { PageHeader } from '@/components/app-shell';
import { JobForm, emptyJob, toBody } from '@/components/job-form';
import { Section } from '@/components/section';
import { useForm } from '@/lib/form';

export default function NewApplicationPage() {
  const router = useRouter();
  const form = useForm(applicationSchema);
  return (
    <>
      <PageHeader title="Save a job" description="It goes into Saved on your board. You can change anything later." back={{ href: '/app/board', label: 'Board' }} />
      <Section>
        <JobForm
          initial={emptyJob}
          submitLabel="Save job"
          pending={form.pending}
          formError={form.formError}
          errors={form.errors}
          onSubmit={async (v) => {
            const saved = await form.submit<ApplicationDetail>({ ...toBody(v), source: 'MANUAL' }, '/applications');
            if (saved) {
              toast.success('Job saved');
              router.push(`/app/applications/${saved.id}`);
            }
          }}
        />
      </Section>
    </>
  );
}
