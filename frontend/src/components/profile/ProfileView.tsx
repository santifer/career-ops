import { useAppState } from '../../state/useAppContext';
import { SectionHeader } from './SectionHeader';
import { IdentitySection } from './IdentitySection';
import { TargetRolesSection } from './TargetRolesSection';
import { NarrativeSection } from './NarrativeSection';
import { StrengthsSection } from './StrengthsSection';
import { DealbreakersSection } from './DealbreakersSection';
import { CvSection } from './CvSection';
import { SearchSourcesSection } from './SearchSourcesSection';

export function ProfileView() {
  const { profile, comments } = useAppState();

  const sectionComments = (sectionId: string) =>
    comments.filter(comment => comment.sectionId === sectionId);
  const commentCount = (sectionId: string) => sectionComments(sectionId).length;

  return (
    <div className="space-y-8 pb-8">
      <div data-section-id="identity">
        <SectionHeader title="Identity" source="config/profile.yml" commentCount={commentCount('identity')} />
        <IdentitySection identity={profile.identity} location={profile.location} comments={sectionComments('identity')} />
      </div>

      <div data-section-id="targeting">
        <SectionHeader title="Target roles" source="profile.yml + _profile.md" commentCount={commentCount('targeting')} />
        <TargetRolesSection targeting={profile.targeting} profileMd={profile.profileMd} comments={sectionComments('targeting')} />
      </div>

      <div data-section-id="narrative">
        <SectionHeader title="Narrative" source="modes/_profile.md" commentCount={commentCount('narrative')} />
        <NarrativeSection narrative={profile.narrative} comments={sectionComments('narrative')} />
      </div>

      <div data-section-id="strengths">
        <SectionHeader title="Strengths" source="cv.md + article-digest.md" commentCount={commentCount('strengths')} />
        <StrengthsSection strengths={profile.strengths} proofPoints={profile.proofPoints} comments={sectionComments('strengths')} />
      </div>

      <div data-section-id="dealBreakers">
        <SectionHeader title="Deal-breakers" source="config/profile.yml" commentCount={commentCount('dealBreakers')} />
        <DealbreakersSection dealBreakers={profile.dealBreakers} comments={sectionComments('dealBreakers')} />
      </div>

      <div data-section-id="cv">
        <SectionHeader title="CV" source="cv.md" commentCount={commentCount('cv')} />
        <CvSection cv={profile.cv} comments={sectionComments('cv')} />
      </div>

      <div data-section-id="searchSources">
        <SectionHeader title="Search sources" source="portals.yml" commentCount={commentCount('searchSources')} />
        <SearchSourcesSection sources={profile.searchSources} comments={sectionComments('searchSources')} />
      </div>
    </div>
  );
}
