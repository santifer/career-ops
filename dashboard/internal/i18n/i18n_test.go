package i18n

import (
	"testing"
	"time"
)

func TestStatusLabel(t *testing.T) {
	tests := []struct {
		norm string
		en   string
		tr   string
	}{
		{"interview", "Interview", "Mülakat"},
		{"offer", "Offer", "Teklif"},
		{"responded", "Responded", "Yanıt Verildi"},
		{"applied", "Applied", "Başvuruldu"},
		{"evaluated", "Evaluated", "Değerlendirildi"},
		{"skip", "SKIP", "Uygun Değil"},
		{"rejected", "Rejected", "Reddedildi"},
		{"discarded", "Discarded", "İptal Edildi"},
		{"unknown", "unknown", "unknown"},
	}

	for _, tt := range tests {
		tt := tt
		t.Run(tt.norm, func(t *testing.T) {
			t.Parallel()
			if got := En.StatusLabel(tt.norm); got != tt.en {
				t.Fatalf("En.StatusLabel(%q) = %q, expected %q", tt.norm, got, tt.en)
			}
			if got := Tr.StatusLabel(tt.norm); got != tt.tr {
				t.Fatalf("Tr.StatusLabel(%q) = %q, expected %q", tt.norm, got, tt.tr)
			}
		})
	}
}

func TestFormatTimeAgo(t *testing.T) {
	// Mock time to ensure deterministic tests
	mockNow := time.Date(2023, 10, 27, 12, 0, 0, 0, time.Local)
	originalNowFunc := NowFunc
	NowFunc = func() time.Time { return mockNow }
	defer func() { NowFunc = originalNowFunc }()

	today := mockNow.Format("2006-01-02")
	yesterday := mockNow.AddDate(0, 0, -1).Format("2006-01-02")
	threeDaysAgo := mockNow.AddDate(0, 0, -3).Format("2006-01-02")
	tomorrow := mockNow.AddDate(0, 0, 1).Format("2006-01-02")

	// English tests
	if got := En.FormatTimeAgo(today); got != "today" {
		t.Errorf("En.FormatTimeAgo(today) = %q; want \"today\"", got)
	}
	if got := En.FormatTimeAgo(yesterday); got != "yesterday" {
		t.Errorf("En.FormatTimeAgo(yesterday) = %q; want \"yesterday\"", got)
	}
	if got := En.FormatTimeAgo(threeDaysAgo); got != "3d ago" {
		t.Errorf("En.FormatTimeAgo(3d ago) = %q; want \"3d ago\"", got)
	}
	if got := En.FormatTimeAgo(tomorrow); got != "today" {
		t.Errorf("En.FormatTimeAgo(tomorrow) = %q; want \"today\"", got)
	}
	if got := En.FormatTimeAgo("not-a-date"); got != "not-a-date" {
		t.Errorf("En.FormatTimeAgo(invalid) = %q; want \"not-a-date\"", got)
	}

	// Turkish tests
	if got := Tr.FormatTimeAgo(today); got != "bugün" {
		t.Errorf("Tr.FormatTimeAgo(today) = %q; want \"bugün\"", got)
	}
	if got := Tr.FormatTimeAgo(yesterday); got != "dün" {
		t.Errorf("Tr.FormatTimeAgo(yesterday) = %q; want \"dün\"", got)
	}
	if got := Tr.FormatTimeAgo(threeDaysAgo); got != "3 gün önce" {
		t.Errorf("Tr.FormatTimeAgo(3d ago) = %q; want \"3 gün önce\"", got)
	}
	if got := Tr.FormatTimeAgo(tomorrow); got != "bugün" {
		t.Errorf("Tr.FormatTimeAgo(tomorrow) = %q; want \"bugün\"", got)
	}
	if got := Tr.FormatTimeAgo("not-a-date"); got != "not-a-date" {
		t.Errorf("Tr.FormatTimeAgo(invalid) = %q; want \"not-a-date\"", got)
	}
}

func TestRuntimeLanguageManagement(t *testing.T) {
	// Reset to En initially
	Current = &En

	if got := GetLang(); got != "en" {
		t.Errorf("initial GetLang() = %q; want \"en\"", got)
	}

	SetLang("tr")
	if Current != &Tr || GetLang() != "tr" {
		t.Errorf("after SetLang(\"tr\"), GetLang() = %q; want \"tr\"", GetLang())
	}

	SetLang("tr_TR")
	if Current != &Tr || GetLang() != "tr" {
		t.Errorf("after SetLang(\"tr_TR\"), GetLang() = %q; want \"tr\"", GetLang())
	}

	SetLang("en")
	if Current != &En || GetLang() != "en" {
		t.Errorf("after SetLang(\"en\"), GetLang() = %q; want \"en\"", GetLang())
	}

	SetLang("fr") // unknown language falls back to en
	if Current != &En || GetLang() != "en" {
		t.Errorf("after SetLang(\"fr\"), GetLang() = %q; want \"en\"", GetLang())
	}

	// Test ToggleLang
	ToggleLang()
	if Current != &Tr || GetLang() != "tr" {
		t.Errorf("after ToggleLang() from En, GetLang() = %q; want \"tr\"", GetLang())
	}

	ToggleLang()
	if Current != &En || GetLang() != "en" {
		t.Errorf("after ToggleLang() from Tr, GetLang() = %q; want \"en\"", GetLang())
	}
}

func TestSortModeLabel(t *testing.T) {
	type sortTestCase struct {
		name string
		mode string
		want string
	}

	enCases := []sortTestCase{
		{name: "score", mode: "score", want: "score"},
		{name: "date", mode: "date", want: "date"},
		{name: "company", mode: "company", want: "company"},
		{name: "status", mode: "status", want: "status"},
		{name: "location", mode: "location", want: "location"},
		{name: "pay", mode: "pay", want: "pay"},
		{name: "last", mode: "last", want: "last"},
		{name: "unknown", mode: "unknown", want: "unknown"},
	}

	for _, tc := range enCases {
		t.Run("En/"+tc.name, func(t *testing.T) {
			if got := En.SortModeLabel(tc.mode); got != tc.want {
				t.Errorf("En.SortModeLabel(%q) = %q; want %q", tc.mode, got, tc.want)
			}
		})
	}

	trCases := []sortTestCase{
		{name: "score", mode: "score", want: "puan"},
		{name: "date", mode: "date", want: "tarih"},
		{name: "company", mode: "company", want: "şirket"},
		{name: "status", mode: "status", want: "durum"},
		{name: "location", mode: "location", want: "konum"},
		{name: "pay", mode: "pay", want: "ücret"},
		{name: "last", mode: "last", want: "son"},
		{name: "unknown", mode: "unknown", want: "unknown"},
	}

	for _, tc := range trCases {
		t.Run("Tr/"+tc.name, func(t *testing.T) {
			if got := Tr.SortModeLabel(tc.mode); got != tc.want {
				t.Errorf("Tr.SortModeLabel(%q) = %q; want %q", tc.mode, got, tc.want)
			}
		})
	}
}

func TestViewModeLabel(t *testing.T) {
	type viewTestCase struct {
		name string
		mode string
		want string
	}

	enCases := []viewTestCase{
		{name: "grouped", mode: "grouped", want: "grouped"},
		{name: "flat", mode: "flat", want: "flat"},
		{name: "unknown", mode: "unknown", want: "unknown"},
	}

	for _, tc := range enCases {
		t.Run("En/"+tc.name, func(t *testing.T) {
			if got := En.ViewModeLabel(tc.mode); got != tc.want {
				t.Errorf("En.ViewModeLabel(%q) = %q; want %q", tc.mode, got, tc.want)
			}
		})
	}

	trCases := []viewTestCase{
		{name: "grouped", mode: "grouped", want: "gruplu"},
		{name: "flat", mode: "flat", want: "düz"},
		{name: "unknown", mode: "unknown", want: "unknown"},
	}

	for _, tc := range trCases {
		t.Run("Tr/"+tc.name, func(t *testing.T) {
			if got := Tr.ViewModeLabel(tc.mode); got != tc.want {
				t.Errorf("Tr.ViewModeLabel(%q) = %q; want %q", tc.mode, got, tc.want)
			}
		})
	}
}
