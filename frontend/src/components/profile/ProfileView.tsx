import { useAppState } from '../../state/AppContext';
import { SectionHeader } from './SectionHeader';
import { IdentitySection } from './IdentitySection';
import { TargetRolesSection } from './TargetRolesSection';
import { NarrativeSection } from './NarrativeSection';
import { StrengthsSection } from './StrengthsSection';
import { DealbreakersSection } from './DealbreakersSection';
import { CvSection } from './CvSection';
import { SearchSourcesSection } from './SearchSourcesSection';

export function ProfileView() {
  const { profile } = useAppState();

  return (
    <div className="space-y-1 pb-8">
      <div data-section-id="identity">
        <SectionHeader title="Identity" />
        <IdentitySection identity={profile.identity} location={profile.location} />
      </div>

      <div data-section-id="targeting">
        <SectionHeader title="Target Roles" />
        <TargetRolesSection targeting={profile.targeting} profileMd={profile.profileMd} />
      </div>

      <div data-section-id="narrative">
        <SectionHeader title="Narrative" />
        <NarrativeSection narrative={profile.narrative} />
      </div>

      <div data-section-id="strengths">
        <SectionHeader title="Strengths" />
        <StrengthsSection strengths={profile.strengths} proofPoints={profile.proofPoints} />
      </div>

      <div data-section-id="dealBreakers">
        <SectionHeader title="Deal-breakers" />
        <DealbreakersSection dealBreakers={profile.dealBreakers} />
      </div>

      <div data-section-id="cv">
        <SectionHeader title="CV" />
        <CvSection cv={profile.cv} />
      </div>

      <div data-section-id="searchSources">
        <SectionHeader title="Search Sources" />
        <SearchSourcesSection sources={profile.searchSources} />
      </div>
    </div>
  );
}
