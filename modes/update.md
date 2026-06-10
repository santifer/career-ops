# Tryb: update — Interaktywna aktualizacja systemu

Gdy użytkownik uruchomi `/career-ops update`, wykonaj ten interaktywny przepływ aktualizacji.

## Krok 1 — Sprawdź aktualizacje

Uruchom `node update-system.mjs check` i sparsuj wyjście JSON.

- Jeśli `up-to-date`: powiedz użytkownikowi „career-ops jest aktualny (v{version})." i zakończ.
- Jeśli `offline`: powiedz „Nie mogę połączyć się z GitHub, by sprawdzić aktualizacje. Spróbuj później." i zakończ.
- Jeśli `dismissed`: powiedz „Sprawdzanie aktualizacji zostało wcześniej odrzucone. Czyszczę odrzucenie i sprawdzam ponownie." Usuń `.update-dismissed`, następnie ponownie uruchom `node update-system.mjs check` i rozgałęź według nowego statusu.
- Jeśli `update-available`: przejdź do Kroku 2.

## Krok 2 — Pokaż, co się zmieniło

Pokaż użytkownikowi, co się zmieni. Uruchom:

```bash
git fetch https://github.com/santifer/career-ops.git main || {
  echo "Failed to fetch latest changes. Cannot generate an accurate diff preview."
  exit 1
}
```

Jeśli fetch się nie powiedzie, przerwij Krok 2 i powiedz użytkownikowi, że nie udało się podejrzeć zmian — nie kontynuuj ze starym `FETCH_HEAD`.

Następnie, tylko jeśli fetch się powiódł, dla każdej kategorii plików Warstwy Systemowej pokaż podsumowanie:

```bash
git diff HEAD..FETCH_HEAD --stat -- modes/ CLAUDE.md AGENTS.md *.mjs batch/ dashboard/ templates/ docs/ VERSION DATA_CONTRACT.md
```

Przedstaw użytkownikowi jako czytelne podsumowanie:

> **Dostępna aktualizacja: v{local} → v{remote}**
>
> **Podsumowanie zmian:**
> - Tryby: zmieniono {N} plików (wymień które)
> - Skrypty: zmieniono {N} plików
> - Dashboard: zmieniono {N} plików
> - Szablony: zmieniono {N} plików
> - Inne: zmieniono {N} plików
>
> **Changelog:**
> {changelog z wyjścia update-system.mjs check}
>
> Twoje pliki osobiste (CV, profil, tracker, raporty) NIE zostaną naruszone.

Jeśli użytkownik chce szczegółów o konkretnych plikach, pokaż faktyczny diff tych plików przez `git diff HEAD..FETCH_HEAD -- {path}`.

## Krok 3 — Sprawdzenie kompatybilności

Przed zastosowaniem sprawdź, czy aktualizacja może wpłynąć na personalizacje użytkownika:

1. **Przeczytaj `modes/_profile.md`** (jeśli istnieje)
2. **Zrób diff `modes/_shared.md`**: uruchom `git diff HEAD..FETCH_HEAD -- modes/_shared.md`
3. **Sprawdź zmiany archetypów**: jeśli `_shared.md` ma zmiany w sekcji „Wykrywanie archetypów", a `_profile.md` odwołuje się do nazw archetypów, ostrzeż użytkownika:
   > „⚠️ Zaktualizowano system oceny lub archetypy. Twoje personalizacje w `_profile.md` mogą odwoływać się do nieaktualnych nazw archetypów. Przejrzę je po aktualizacji."
4. **Sprawdź zmiany w ocenianiu**: jeśli zmieniła się sekcja „System oceny", odnotuj:
   > „ℹ️ Zaktualizowano system oceny. Wyniki w przyszłych ocenach mogą się nieznacznie różnić od poprzednich."
5. **Sprawdź nowe pliki trybów**: jeśli dodano nowe tryby (pliki w `modes/`, których nie ma lokalnie), wspomnij o nich:
   > „✨ Dostępne nowe tryby: {lista}. Uruchom `/career-ops`, by zobaczyć wszystkie komendy."

## Krok 4 — Potwierdź i zastosuj

Poproś użytkownika o potwierdzenie:
> „Gotowe do aktualizacji. Zastosować zmiany? (Można je cofnąć przez `/career-ops update rollback`)"

Jeśli tak:
1. Zarejestruj bieżący commit jako bazę sprzed aktualizacji specyficzną dla tego uruchomienia, zanim ruszy apply, np. `PRE_UPDATE_REF=$(git rev-parse HEAD)`. Nie polegaj wyłącznie na `backup-pre-update-{local}` — `update-system.mjs apply` ponownie używa tej gałęzi, jeśli już istnieje, więc może wskazywać starszy snapshot.
2. Uruchom `node update-system.mjs apply`
   - Jeśli komenda zakończy się kodem niezerowym, potraktuj apply jako nieudane. Pokaż zarejestrowane wyjście i zaproponuj:
     > „⚠️ Zastosowanie aktualizacji nie powiodło się. Pokazać pełny błąd, czy spróbować `/career-ops update rollback`?"
   - Zatrzymaj przepływ tutaj, jeśli apply zawiodło — nie uruchamiaj doctora ani uzgadniania na częściowo zastosowanej aktualizacji.
3. Uruchom `node doctor.mjs`, by zweryfikować instalację
   - Jeśli komenda zakończy się kodem niezerowym, potraktuj walidację jako nieudaną. Pokaż zarejestrowane wyjście i zaproponuj:
     > „⚠️ Walidacja po aktualizacji nie powiodła się. Pokazać pełny błąd, czy cofnąć przez `/career-ops update rollback`?"
   - Zatrzymaj przepływ tutaj, jeśli walidacja zawiodła — nie uruchamiaj uzgadniania ani nie pokazuj komunikatu o sukcesie.
4. Jeśli Krok 3 oznaczył zmiany archetypów/oceniania, uzgodnij `modes/_profile.md` z nowym `modes/_shared.md`:
   - Przeczytaj zarówno wersję sprzed aktualizacji (`git show $PRE_UPDATE_REF:modes/_shared.md`), jak i wersję po aktualizacji `modes/_shared.md`.
   - Wyciągnij kanoniczne identyfikatory archetypów z każdej wersji (nagłówki/definicje archetypów oraz wszelkie pola slug/alias).
   - Przeczytaj `modes/_profile.md` i poszukaj tokenów pasujących do nazw archetypów (tekst inline, linki Markdown, klucze YAML, fragmenty kodu).
   - Sklasyfikuj każde odwołanie:
     - **Bez zmian**: dokładne dopasowanie w nowym `_shared.md` → brak działania.
     - **Zmiana nazwy**: brak dokładnego dopasowania, ale jedno silne dopasowanie rozmyte w nowym `_shared.md` (np. podobieństwo Levenshteina ≥ 0,7) → zaproponuj zmianę nazwy.
     - **Usunięto**: brak dopasowania → zaproponuj usunięcie lub zastąpienie.
   - Gdy wykryto zmianę nazwy lub usunięcie, zapytaj przed edycją:
     - Dla zmian nazwy:
       > „Twój _profile.md odwołuje się do archetypu '{old_name}', którego nazwę zmieniono na '{new_name}'. Zaktualizować?"
     - Dla usunięć:
       > „Twój _profile.md odwołuje się do archetypu '{old_name}', który usunięto w nowym _shared.md. Usunąć odwołanie czy zastąpić je innym archetypem?"
5. Pokaż finalny status:
   > „✅ Zaktualizowano do v{version}. Uruchom `node doctor.mjs` w dowolnej chwili, by zweryfikować konfigurację."

Jeśli nie:
1. Uruchom `node update-system.mjs dismiss`
2. Powiedz użytkownikowi, że może uruchomić `/career-ops update` w dowolnej chwili, by sprawdzić ponownie.

## Krok 5 — Rollback (na żądanie)

Jeśli użytkownik powie „rollback" lub uruchomi `/career-ops update rollback`:
1. Uruchom `node update-system.mjs rollback`
2. Pokaż, co zostało przywrócone.

## Reguły

- NIGDY nie modyfikuj automatycznie plików Warstwy Użytkownika podczas aktualizacji (cv.md, config/profile.yml, data/, reports/, output/, interview-prep/, jds/, article-digest.md, portals.yml)
- `modes/_profile.md` to także Warstwa Użytkownika: sprawdzenie kompatybilności w Kroku 3 czyta go ściśle tylko do odczytu
- Wyjątek: `modes/_profile.md` może być edytowany **wyłącznie** w Kroku 4.3 i **tylko** po tym, jak użytkownik wyraźnie potwierdzi każdą pojedynczą zmianę nazwy/usunięcie. Nigdy nie edytuj zbiorczo bez zgody na każdą zmianę.
- Personalizacje specyficzne dla użytkownika (archetypy, wagi oceny, narracja) należą do `modes/_profile.md` lub `config/profile.yml`, nigdy do `modes/_shared.md`
- Jeśli coś pójdzie nie tak, powiedz użytkownikowi, by uruchomił `node update-system.mjs rollback`
- Trzymaj wyjście zwięzłe — użytkownicy nie chcą ścian tekstu podczas aktualizacji
