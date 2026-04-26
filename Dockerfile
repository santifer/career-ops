FROM golang:1.25.0 AS build

WORKDIR /src/dashboard
COPY dashboard/go.mod dashboard/go.sum ./
RUN go mod download
COPY dashboard/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -o /out/career-ops-cockpit ./cockpit

FROM node:24-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /out/career-ops-cockpit /app/career-ops-cockpit
COPY verify-pipeline.mjs scan.mjs /app/
COPY templates/states.yml /app/templates/states.yml
COPY data/ /app/data/
COPY reports/ /app/reports/
COPY output/ /app/output/
COPY config/profile.yml /app/config/profile.yml
COPY context/ /app/context/
COPY modes/_profile.md /app/modes/_profile.md
COPY cv.md portals.yml /app/
RUN mkdir -p /app/data /app/reports /app/output /app/context /app/batch/tracker-additions \
    && node -e "const fs=require('fs'); const yaml=require('js-yaml'); const cfg=yaml.load(fs.readFileSync('/app/config/profile.yml','utf8')); const candidate=cfg.candidate||{}; const loc=cfg.location||{}; const comp=cfg.compensation||{}; const narrative=cfg.narrative||{}; const profile={identity:{full_name:candidate.full_name||'',preferred_name:'',email:candidate.email||'',phone:{country_code:'',number:candidate.phone||'',whatsapp:false},linkedin:candidate.linkedin||'',github:candidate.github||''},personal:{gender:'',pronouns:'',date_of_birth:'',nationality:loc.country||'',work_authorization:loc.visa_status||'',disability_status:'',veteran_status:'',race_ethnicity:''},address:{country:loc.country||'',state:'',city:loc.city||candidate.location||'',neighborhood:'',street:'',number:'',complement:'',postal_code:''},availability:{notice_period:'',start_date:'',work_modes:loc.work_modes||[],relocation:comp.location_flexibility||'',travel_availability:''},compensation:{currency:comp.currency||'',target_monthly:comp.target_range||'',minimum_monthly:comp.minimum||'',negotiable:true},languages:{portuguese:'Native',english:'C2',spanish:'C1'},documents:{default_cv:'cv.md',latest_tailored_cv:'',cover_letter_template:'',portfolio_url:'',case_studies:(narrative.proof_points||[]).map(p=>p.name).filter(Boolean)},form_answers:{why_this_company:'',why_this_role:'',why_should_we_hire_you:narrative.exit_story||'',salary_expectation:comp.target_range||'',notice_period:'',work_authorization:loc.visa_status||'',remote_hybrid_preference:comp.location_flexibility||'',leadership_style:'',biggest_achievement:(narrative.proof_points||[]).map(p=>[p.name,p.hero_metric].filter(Boolean).join(': ')).join('\\n'),reason_for_leaving:''},custom_fields:{headline:narrative.headline||'',superpowers:narrative.superpowers||[]}}; fs.writeFileSync('/app/context/application-profile.yml', yaml.dump(profile), 'utf8');"
EXPOSE 8080

ENTRYPOINT ["/app/career-ops-cockpit", "-path", "/app"]
