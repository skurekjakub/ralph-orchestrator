# Reads the lines `envelope_lines` (lib/record.jq) prints, scrubs credentials
# from every string, cuts resultText and lastMessage to the audit text budget,
# and prints the shell assignments lib/common.sh evals.
#
# Input lines are "record.<key>\t<JSON value>", "logLine\t<JSON string>" and
# "toolOutput\t<JSON string>". Every pass is one regex scan, so the cost grows
# with the text length and not with the number of secrets in it.
use strict;
use warnings;

my $TEXT_LIMIT = 2000;
my %CUT_FIELDS = map { $_ => 1 } qw(resultText lastMessage);

# Hooks inherit the CLI's environment, so these are exactly the secrets an
# agent could echo. Longest first, so a secret that contains another one is
# replaced whole.
my @secrets = sort { length($b) <=> length($a) }
  grep { length($_) >= 8 }
  map { my $value = $ENV{$_}; utf8::decode($value); $value }
  grep { /TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|CREDENTIAL|(?:^|_)PAT(?:_|$)/ } keys %ENV;
my $secret_re = @secrets ? join('|', map { quotemeta } @secrets) : undef;
$secret_re = qr/$secret_re/ if defined $secret_re;

# Scrubs the literal secret values, then well-known token formats, HTTP
# authorization values, URL passwords and KEY=value / "key": "value"
# assignments whose key names a secret.
sub redact {
  my ($text) = @_;
  $text =~ s/$secret_re/[REDACTED]/g if defined $secret_re;
  $text =~ s/sk-ant-[A-Za-z0-9_-]{8,}/[REDACTED]/g;
  $text =~ s/\bgh[pousr]_[A-Za-z0-9]{20,}/[REDACTED]/g;
  $text =~ s/\bgithub_pat_[A-Za-z0-9_]{20,}/[REDACTED]/g;
  $text =~ s/((?i:authorization)\\?"?\s*[:=]\s*\\?"?(?i:bearer|basic|token)\s+)[^\s"'\\]+/${1}[REDACTED]/g;
  $text =~ s{(://[^/@\s:]+:)[^/@\s]+@}{${1}[REDACTED]@}g;
  $text =~ s/(\b[A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API_?KEY|PRIVATE_KEY|_PAT)=)[^\s"'\\\$][^\s"'\\]*/${1}[REDACTED]/g;
  $text =~ s/(\\?"[A-Za-z0-9_-]*(?i:token|secret|password|passwd|api_?key|private_?key|pat)\\?"\s*:\s*\\?")[^"\\]+/${1}[REDACTED]/g;
  return $text;
}

my %UNESCAPE = ('"' => '"', '\\' => '\\', '/' => '/', b => "\b", f => "\f", n => "\n", r => "\r", t => "\t");

# A code point for one \uXXXX escape; a lone surrogate becomes U+FFFD.
sub code_point {
  my ($hex) = @_;
  my $cp = hex $hex;
  return $cp >= 0xD800 && $cp <= 0xDFFF ? "\x{FFFD}" : chr $cp;
}

# Decodes a JSON string literal (quotes included).
sub json_decode_string {
  my ($literal) = @_;
  my $text = substr($literal, 1, -1);
  $text =~ s{\\u([dD][89abAB][0-9a-fA-F]{2})\\u([dD][c-fC-F][0-9a-fA-F]{2})|\\u([0-9a-fA-F]{4})|\\(.)}{
    defined $1 ? chr(0x10000 + ((hex($1) - 0xD800) << 10) + (hex($2) - 0xDC00))
    : defined $3 ? code_point($3)
    : $UNESCAPE{$4} // $4
  }ge;
  return $text;
}

my %ESCAPE = ('"' => '\\"', '\\' => '\\\\', "\b" => '\\b', "\f" => '\\f', "\n" => '\\n', "\r" => '\\r', "\t" => '\\t');

# Encodes a string as a JSON string literal.
sub json_encode_string {
  my ($text) = @_;
  $text =~ s{(["\\\x00-\x1f\x7f])}{$ESCAPE{$1} // sprintf('\\u%04x', ord $1)}ge;
  return qq("$text");
}

# Single-quotes a string as UTF-8 for the shell; bash variables cannot hold NUL.
sub sh_quote {
  my ($text) = @_;
  $text =~ tr/\x00//d;
  utf8::encode($text);
  $text =~ s/'/'\\''/g;
  return "'$text'";
}

my (@record, %text);
while (my $line = <STDIN>) {
  chomp $line;
  utf8::decode($line);
  my ($name, $json) = split /\t/, $line, 2;
  die "malformed envelope line\n" unless defined $json;
  if ($name =~ /^record\.(.+)$/) {
    my $key = $1;
    if ($json =~ /^"/) {
      my $value = redact(json_decode_string($json));
      $value = substr($value, 0, $TEXT_LIMIT) . '...[truncated]' if $CUT_FIELDS{$key} && length($value) > $TEXT_LIMIT;
      $json = json_encode_string($value);
    }
    push @record, json_encode_string($key) . ":$json";
  } elsif ($name eq 'logLine' || $name eq 'toolOutput') {
    $text{$name} = redact(json_decode_string($json));
  } else {
    die "unknown envelope field $name\n";
  }
}
die "empty envelope\n" unless @record;

print 'RALPH_RECORD=', sh_quote('{' . join(',', @record) . '}'), "\n";
print 'RALPH_LOG_LINE=', sh_quote($text{logLine} // ''), "\n";
print 'RALPH_TOOL_OUTPUT=', sh_quote($text{toolOutput} // ''), "\n";
